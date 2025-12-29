/**
 * ============================================
 * STUDY HUB - Chat System
 * ============================================
 * Part 1: Core Chat Functionality
 * 
 * Features:
 * - Real-time messaging
 * - Message sending with validation
 * - Message receiving & display
 * - User status tracking
 * - Cooldown management
 * ============================================
 */

import {
    auth,
    db,
    storage,
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    onSnapshot,
    serverTimestamp,
    increment,
    Timestamp,
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    COLLECTIONS,
    formatTimestamp,
    timeAgo
} from './firebase-config.js';

import {
    getCurrentUser,
    getCurrentUserData,
    refreshUserData,
    isMuted,
    isBanned,
    getMuteEndTime,
    isAdmin
} from './auth.js';

import {
    contentFilter,
    FILTER_RESULT,
    FILTER_CONFIG
} from './filter.js';

import { showToast } from './auth.js';

// ============================================
// CHAT CONFIGURATION
// ============================================
const CHAT_CONFIG = {
    // Message limits
    MAX_MESSAGE_LENGTH: 500,
    MIN_MESSAGE_LENGTH: 1,
    
    // Pagination
    MESSAGES_PER_PAGE: 50,
    LOAD_MORE_THRESHOLD: 100, // pixels from top
    
    // Image settings
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    IMAGE_QUALITY: 0.85,
    MAX_IMAGE_DIMENSION: 1200,
    
    // Cooldown
    MESSAGE_COOLDOWN: 5000, // 5 seconds
    
    // UI settings
    SCROLL_THRESHOLD: 200, // pixels from bottom to show scroll button
    AUTO_SCROLL: true,
    TYPING_INDICATOR_TIMEOUT: 3000,
    
    // Pinned messages
    MAX_PINNED_MESSAGES: 3
};

// ============================================
// CHAT STATE
// ============================================
let chatState = {
    isInitialized: false,
    isLoading: false,
    isSending: false,
    lastMessageTimestamp: null,
    firstMessageTimestamp: null,
    unsubscribeMessages: null,
    unsubscribePinned: null,
    messages: [],
    pinnedMessages: [],
    cooldownEndTime: null,
    cooldownTimer: null,
    selectedImage: null,
    isAtBottom: true,
    newMessageCount: 0
};

// DOM Elements cache
let elements = {};

// ============================================
// CHAT MANAGER CLASS
// ============================================
class ChatManager {
    constructor() {
        this.state = chatState;
        this.elements = elements;
        this.listeners = [];
    }
    
    /**
     * Initialize chat system
     */
    async init() {
        if (this.state.isInitialized) return;
        
        console.log('💬 Initializing Chat System...');
        
        // Cache DOM elements
        this.cacheElements();
        
        // Check user authentication
        const user = getCurrentUser();
        const userData = getCurrentUserData();
        
        if (!user || !userData) {
            console.error('User not authenticated');
            this.showAuthRequired();
            return;
        }
        
        // Check if user is banned
        if (isBanned()) {
            this.showBannedState(userData.banReason);
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load pinned messages
        await this.loadPinnedMessages();
        
        // Setup real-time message listener
        this.setupMessageListener();
        
        // Check mute status
        if (isMuted()) {
            this.showMutedState();
        }
        
        // Update user status to online
        this.updateUserStatus('online');
        
        // Setup visibility change handler
        this.setupVisibilityHandler();
        
        this.state.isInitialized = true;
        console.log('💬 Chat System initialized');
    }
    
    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            // Main containers
            chatWrapper: document.querySelector('.chat-wrapper'),
            chatContainer: document.querySelector('.chat-container'),
            chatMain: document.querySelector('.chat-main'),
            messagesContainer: document.querySelector('.chat-messages'),
            
            // Input area
            inputContainer: document.querySelector('.chat-input-container'),
            inputWrapper: document.querySelector('.chat-input-wrapper'),
            inputField: document.querySelector('.chat-input'),
            sendButton: document.querySelector('.chat-send-btn'),
            attachButton: document.querySelector('.chat-attach-btn'),
            fileInput: document.querySelector('#imageInput'),
            charCounter: document.querySelector('.char-counter'),
            
            // Image preview
            imagePreviewContainer: document.querySelector('.image-preview-container'),
            imagePreview: document.querySelector('.image-preview-img'),
            removeImageBtn: document.querySelector('.image-preview-remove'),
            
            // Pinned messages
            pinnedSection: document.querySelector('.pinned-messages'),
            pinnedList: document.querySelector('.pinned-messages-list'),
            pinnedHeader: document.querySelector('.pinned-header'),
            pinnedCount: document.querySelector('.pinned-count'),
            
            // Scroll button
            scrollButton: document.querySelector('.scroll-to-bottom'),
            newMessageIndicator: document.querySelector('.new-message-indicator'),
            
            // Other
            cooldownOverlay: document.querySelector('.cooldown-overlay'),
            cooldownTimer: document.querySelector('.cooldown-timer'),
            emptyState: document.querySelector('.chat-empty'),
            loadingState: document.querySelector('.chat-loading'),
            restrictedState: document.querySelector('.chat-restricted'),
            
            // Lightbox
            lightboxOverlay: document.querySelector('.lightbox-overlay'),
            lightboxImage: document.querySelector('.lightbox-image'),
            lightboxClose: document.querySelector('.lightbox-close')
        };
        
        elements = this.elements;
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Input field events
        if (this.elements.inputField) {
            // Input handling
            this.elements.inputField.addEventListener('input', (e) => {
                this.handleInputChange(e);
            });
            
            // Enter to send
            this.elements.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Auto-resize textarea
            this.elements.inputField.addEventListener('input', () => {
                this.autoResizeTextarea();
            });
        }
        
        // Send button
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => {
                this.sendMessage();
            });
        }
        
        // Attach/Image button
        if (this.elements.attachButton && this.elements.fileInput) {
            this.elements.attachButton.addEventListener('click', () => {
                this.elements.fileInput.click();
            });
            
            this.elements.fileInput.addEventListener('change', (e) => {
                this.handleImageSelect(e);
            });
        }
        
        // Remove image button
        if (this.elements.removeImageBtn) {
            this.elements.removeImageBtn.addEventListener('click', () => {
                this.clearSelectedImage();
            });
        }
        
        // Scroll button
        if (this.elements.scrollButton) {
            this.elements.scrollButton.addEventListener('click', () => {
                this.scrollToBottom(true);
            });
        }
        
        // Messages container scroll
        if (this.elements.messagesContainer) {
            this.elements.messagesContainer.addEventListener('scroll', () => {
                this.handleScroll();
            });
        }
        
        // Pinned section toggle
        if (this.elements.pinnedHeader) {
            this.elements.pinnedHeader.addEventListener('click', () => {
                this.togglePinnedSection();
            });
        }
        
        // Lightbox close
        if (this.elements.lightboxOverlay) {
            this.elements.lightboxOverlay.addEventListener('click', (e) => {
                if (e.target === this.elements.lightboxOverlay || 
                    e.target === this.elements.lightboxClose) {
                    this.closeLightbox();
                }
            });
        }
        
        // Keyboard shortcut for lightbox
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeLightbox();
            }
        });
        
        // Window beforeunload - update status
        window.addEventListener('beforeunload', () => {
            this.updateUserStatus('offline');
        });
    }
    
    /**
     * Setup visibility change handler
     */
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.updateUserStatus('away');
            } else {
                this.updateUserStatus('online');
                // Refresh user data to check mute status
                refreshUserData().then(() => {
                    if (isMuted()) {
                        this.showMutedState();
                    } else {
                        this.hideMutedState();
                    }
                });
            }
        });
    }
    
    // ============================================
    // MESSAGE SENDING
    // ============================================
    
    /**
     * Send a message
     */
    async sendMessage() {
        // Prevent multiple sends
        if (this.state.isSending) return;
        
        const user = getCurrentUser();
        const userData = getCurrentUserData();
        
        if (!user || !userData) {
            showToast('Please login to send messages', 'error');
            return;
        }
        
        // Check if banned
        if (isBanned()) {
            showToast('You are banned from this chat', 'error');
            return;
        }
        
        // Check if muted
        if (isMuted()) {
            this.showMutedState();
            return;
        }
        
        // Get message text
        const messageText = this.elements.inputField?.value?.trim() || '';
        const hasImage = this.state.selectedImage !== null;
        
        // Validate - must have text or image
        if (!messageText && !hasImage) {
            return;
        }
        
        // Check message length
        if (messageText.length > CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
            showToast(`Message too long. Maximum ${CHAT_CONFIG.MAX_MESSAGE_LENGTH} characters.`, 'error');
            return;
        }
        
        // Run content filter on text
        if (messageText) {
            const filterResult = await contentFilter.checkMessage(
                messageText, 
                user.uid, 
                userData
            );
            
            if (!filterResult.allowed) {
                this.showFilterWarning(filterResult);
                return;
            }
        }
        
        // Start sending
        this.state.isSending = true;
        this.setSendingState(true);
        
        try {
            let imageURL = null;
            
            // Upload image if selected
            if (hasImage) {
                imageURL = await this.uploadMessageImage();
                
                if (!imageURL) {
                    throw new Error('Failed to upload image');
                }
            }
            
            // Create message document
            const messageData = {
                senderId: user.uid,
                senderName: userData.displayName,
                senderUsername: userData.username,
                senderAvatar: userData.photoURL,
                senderGender: userData.gender,
                content: messageText,
                type: hasImage ? 'image' : 'text',
                imageURL: imageURL,
                isPinned: false,
                isAdminReply: false,
                replyToMessageId: null,
                replyToContent: null,
                isArchived: false,
                timestamp: serverTimestamp()
            };
            
            // Add message to Firestore
            await addDoc(collection(db, COLLECTIONS.MESSAGES), messageData);
            
            // Update user's total message count
            await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
                totalMessages: increment(1),
                lastActive: serverTimestamp()
            });
            
            // Clear input
            this.clearInput();
            
            // Start cooldown
            this.startCooldown();
            
            // Scroll to bottom
            this.scrollToBottom(true);
            
        } catch (error) {
            console.error('Error sending message:', error);
            showToast('Failed to send message. Please try again.', 'error');
        } finally {
            this.state.isSending = false;
            this.setSendingState(false);
        }
    }
    
    /**
     * Set sending state UI
     * @param {boolean} isSending - Whether currently sending
     */
    setSendingState(isSending) {
        if (this.elements.sendButton) {
            if (isSending) {
                this.elements.sendButton.disabled = true;
                this.elements.sendButton.classList.add('loading');
            } else {
                this.elements.sendButton.disabled = false;
                this.elements.sendButton.classList.remove('loading');
            }
        }
        
        if (this.elements.inputField) {
            this.elements.inputField.disabled = isSending;
        }
    }
    
    /**
     * Clear input field and selected image
     */
    clearInput() {
        if (this.elements.inputField) {
            this.elements.inputField.value = '';
            this.autoResizeTextarea();
        }
        
        this.clearSelectedImage();
        this.updateCharCounter(0);
    }
    
    /**
     * Show filter warning
     * @param {Object} filterResult - Filter check result
     */
    showFilterWarning(filterResult) {
        // Show warning toast
        showToast(filterResult.message, 'warning');
        
        // Show warning popup
        let warningPopup = document.querySelector('.warning-popup');
        
        if (!warningPopup) {
            warningPopup = document.createElement('div');
            warningPopup.className = 'warning-popup';
            document.body.appendChild(warningPopup);
        }
        
        const isError = filterResult.type === FILTER_RESULT.MUTED || 
                       filterResult.type === FILTER_RESULT.BANNED;
        
        warningPopup.className = `warning-popup ${isError ? 'error' : ''}`;
        warningPopup.innerHTML = `
            <span class="warning-popup-icon">${isError ? '🚫' : '⚠️'}</span>
            <span class="warning-popup-message">${filterResult.message}</span>
        `;
        
        warningPopup.classList.add('active');
        
        setTimeout(() => {
            warningPopup.classList.remove('active');
        }, 4000);
        
        // If user is now muted, show muted state
        if (filterResult.type === FILTER_RESULT.MUTED) {
            refreshUserData().then(() => {
                this.showMutedState();
            });
        }
    }
    
    // ============================================
    // MESSAGE RECEIVING
    // ============================================
    
    /**
     * Setup real-time message listener
     */
    setupMessageListener() {
        // Unsubscribe existing listener
        if (this.state.unsubscribeMessages) {
            this.state.unsubscribeMessages();
        }
        
        // Show loading state
        this.showLoadingState();
        
        // Create query for messages
        const messagesRef = collection(db, COLLECTIONS.MESSAGES);
        const messagesQuery = query(
            messagesRef,
            where('isArchived', '==', false),
            orderBy('timestamp', 'desc'),
            limit(CHAT_CONFIG.MESSAGES_PER_PAGE)
        );
        
        // Setup listener
        this.state.unsubscribeMessages = onSnapshot(messagesQuery, 
            (snapshot) => {
                this.handleMessagesSnapshot(snapshot);
            },
            (error) => {
                console.error('Message listener error:', error);
                this.showErrorState('Failed to load messages');
            }
        );
    }
    
    /**
     * Handle messages snapshot
     * @param {QuerySnapshot} snapshot - Firestore snapshot
     */
    handleMessagesSnapshot(snapshot) {
        const messages = [];
        let hasNewMessages = false;
        
        snapshot.forEach(doc => {
            const message = {
                id: doc.id,
                ...doc.data()
            };
            messages.push(message);
        });
        
        // Reverse to show oldest first
        messages.reverse();
        
        // Check for new messages
        if (this.state.messages.length > 0 && messages.length > this.state.messages.length) {
            hasNewMessages = true;
            const newCount = messages.length - this.state.messages.length;
            
            if (!this.state.isAtBottom) {
                this.state.newMessageCount += newCount;
                this.updateNewMessageIndicator();
            }
        }
        
        // Update state
        this.state.messages = messages;
        
        if (messages.length > 0) {
            this.state.firstMessageTimestamp = messages[0].timestamp;
            this.state.lastMessageTimestamp = messages[messages.length - 1].timestamp;
        }
        
        // Render messages
        this.renderMessages(messages);
        
        // Hide loading state
        this.hideLoadingState();
        
        // Auto scroll for new messages
        if (hasNewMessages && this.state.isAtBottom) {
            this.scrollToBottom(false);
        }
        
        // Play notification sound for new messages
        if (hasNewMessages && !this.state.isAtBottom && document.hidden) {
            this.playNotificationSound();
        }
    }
    
    /**
     * Load more messages (pagination)
     */
    async loadMoreMessages() {
        if (this.state.isLoading || !this.state.firstMessageTimestamp) return;
        
        this.state.isLoading = true;
        
        try {
            const messagesRef = collection(db, COLLECTIONS.MESSAGES);
            const moreQuery = query(
                messagesRef,
                where('isArchived', '==', false),
                orderBy('timestamp', 'desc'),
                startAfter(this.state.firstMessageTimestamp),
                limit(CHAT_CONFIG.MESSAGES_PER_PAGE)
            );
            
            const snapshot = await getDocs(moreQuery);
            
            if (snapshot.empty) {
                console.log('No more messages to load');
                return;
            }
            
            const olderMessages = [];
            snapshot.forEach(doc => {
                olderMessages.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Reverse to show oldest first
            olderMessages.reverse();
            
            // Update state
            this.state.messages = [...olderMessages, ...this.state.messages];
            this.state.firstMessageTimestamp = olderMessages[0].timestamp;
            
            // Render older messages at top
            this.prependMessages(olderMessages);
            
        } catch (error) {
            console.error('Error loading more messages:', error);
        } finally {
            this.state.isLoading = false;
        }
    }
    
    // ============================================
    // COOLDOWN MANAGEMENT
    // ============================================
    
    /**
     * Start message cooldown
     */
    startCooldown() {
        this.state.cooldownEndTime = Date.now() + CHAT_CONFIG.MESSAGE_COOLDOWN;
        
        // Show cooldown overlay
        this.showCooldownOverlay();
        
        // Update cooldown timer
        this.updateCooldownTimer();
        
        // Clear existing timer
        if (this.state.cooldownTimer) {
            clearInterval(this.state.cooldownTimer);
        }
        
        // Start countdown
        this.state.cooldownTimer = setInterval(() => {
            this.updateCooldownTimer();
        }, 100);
    }
    
    /**
     * Update cooldown timer display
     */
    updateCooldownTimer() {
        const remaining = this.state.cooldownEndTime - Date.now();
        
        if (remaining <= 0) {
            this.endCooldown();
            return;
        }
        
        const seconds = Math.ceil(remaining / 1000);
        
        if (this.elements.cooldownTimer) {
            this.elements.cooldownTimer.textContent = `${seconds}s`;
        }
    }
    
    /**
     * End cooldown
     */
    endCooldown() {
        if (this.state.cooldownTimer) {
            clearInterval(this.state.cooldownTimer);
            this.state.cooldownTimer = null;
        }
        
        this.state.cooldownEndTime = null;
        this.hideCooldownOverlay();
    }
    
    /**
     * Show cooldown overlay
     */
    showCooldownOverlay() {
        if (this.elements.cooldownOverlay) {
            this.elements.cooldownOverlay.style.display = 'flex';
        }
        
        if (this.elements.inputField) {
            this.elements.inputField.disabled = true;
        }
        
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = true;
        }
    }
    
    /**
     * Hide cooldown overlay
     */
    hideCooldownOverlay() {
        if (this.elements.cooldownOverlay) {
            this.elements.cooldownOverlay.style.display = 'none';
        }
        
        // Only enable if not muted
        if (!isMuted()) {
            if (this.elements.inputField) {
                this.elements.inputField.disabled = false;
                this.elements.inputField.focus();
            }
            
            if (this.elements.sendButton) {
                this.elements.sendButton.disabled = false;
            }
        }
    }
    
    // ============================================
    // MUTED/BANNED STATE
    // ============================================
    
    /**
     * Show muted state
     */
    showMutedState() {
        const muteEndTime = getMuteEndTime();
        
        if (!muteEndTime) return;
        
        // Disable input
        if (this.elements.inputField) {
            this.elements.inputField.disabled = true;
            this.elements.inputField.placeholder = 'You are muted...';
        }
        
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = true;
        }
        
        if (this.elements.attachButton) {
            this.elements.attachButton.disabled = true;
        }
        
        // Show restricted state
        if (this.elements.restrictedState) {
            const remaining = this.formatMuteTime(muteEndTime);
            
            this.elements.restrictedState.innerHTML = `
                <div class="chat-restricted-card">
                    <span class="chat-restricted-icon">🔇</span>
                    <h3 class="chat-restricted-title">You are muted</h3>
                    <p class="chat-restricted-message">
                        You cannot send messages at this time.
                    </p>
                    <p class="chat-restricted-time">
                        Time remaining: ${remaining}
                    </p>
                </div>
            `;
            
            this.elements.restrictedState.style.display = 'block';
        }
        
        // Hide input container
        if (this.elements.inputContainer) {
            this.elements.inputContainer.style.display = 'none';
        }
        
        // Setup timer to check when mute ends
        this.setupMuteCheckTimer(muteEndTime);
    }
    
    /**
     * Hide muted state
     */
    hideMutedState() {
        if (this.elements.inputField) {
            this.elements.inputField.disabled = false;
            this.elements.inputField.placeholder = 'Type a message...';
        }
        
        if (this.elements.sendButton) {
            this.elements.sendButton.disabled = false;
        }
        
        if (this.elements.attachButton) {
            this.elements.attachButton.disabled = false;
        }
        
        if (this.elements.restrictedState) {
            this.elements.restrictedState.style.display = 'none';
        }
        
        if (this.elements.inputContainer) {
            this.elements.inputContainer.style.display = 'block';
        }
    }
    
    /**
     * Show banned state
     * @param {string} reason - Ban reason
     */
    showBannedState(reason) {
        if (this.elements.restrictedState) {
            this.elements.restrictedState.innerHTML = `
                <div class="chat-restricted-card">
                    <span class="chat-restricted-icon">⛔</span>
                    <h3 class="chat-restricted-title">You are banned</h3>
                    <p class="chat-restricted-message">
                        ${reason || 'Violation of community guidelines'}
                    </p>
                    <p class="chat-restricted-time">
                        This ban is permanent. Contact support if you believe this is an error.
                    </p>
                </div>
            `;
            
            this.elements.restrictedState.style.display = 'block';
        }
        
        // Hide input and messages
        if (this.elements.inputContainer) {
            this.elements.inputContainer.style.display = 'none';
        }
        
        if (this.elements.messagesContainer) {
            this.elements.messagesContainer.style.display = 'none';
        }
    }
    
    /**
     * Setup timer to check when mute ends
     * @param {Date} muteEndTime - When mute ends
     */
    setupMuteCheckTimer(muteEndTime) {
        const checkInterval = setInterval(() => {
            if (new Date() >= muteEndTime) {
                clearInterval(checkInterval);
                refreshUserData().then(() => {
                    if (!isMuted()) {
                        this.hideMutedState();
                        showToast('You can now send messages again', 'success');
                    }
                });
            } else {
                // Update remaining time display
                if (this.elements.restrictedState) {
                    const timeEl = this.elements.restrictedState.querySelector('.chat-restricted-time');
                    if (timeEl) {
                        timeEl.textContent = `Time remaining: ${this.formatMuteTime(muteEndTime)}`;
                    }
                }
            }
        }, 1000);
    }
    
    /**
     * Format mute remaining time
     * @param {Date} endTime - Mute end time
     * @returns {string}
     */
    formatMuteTime(endTime) {
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) return '0 seconds';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        
        return `${seconds}s`;
    }
    
    // ============================================
    // INPUT HANDLING
    // ============================================
    
    /**
     * Handle input change
     * @param {Event} e - Input event
     */
    handleInputChange(e) {
        const text = e.target.value;
        const length = text.length;
        
        // Update character counter
        this.updateCharCounter(length);
        
        // Check for URLs (show warning but don't block typing)
        if (this.containsURL(text)) {
            this.showURLWarning();
        }
    }
    
    /**
     * Update character counter
     * @param {number} length - Current text length
     */
    updateCharCounter(length) {
        if (!this.elements.charCounter) return;
        
        this.elements.charCounter.textContent = `${length}/${CHAT_CONFIG.MAX_MESSAGE_LENGTH}`;
        
        // Update styling based on length
        this.elements.charCounter.classList.remove('warning', 'error');
        
        if (length >= CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
            this.elements.charCounter.classList.add('error');
        } else if (length >= CHAT_CONFIG.MAX_MESSAGE_LENGTH * 0.8) {
            this.elements.charCounter.classList.add('warning');
        }
    }
    
    /**
     * Auto-resize textarea
     */
    autoResizeTextarea() {
        const textarea = this.elements.inputField;
        if (!textarea) return;
        
        // Reset height to auto to get correct scrollHeight
        textarea.style.height = 'auto';
        
        // Set height based on content (with max height)
        const maxHeight = 150;
        const newHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = `${newHeight}px`;
        
        // Add scrollbar if exceeds max height
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
    
    /**
     * Check if text contains URL
     * @param {string} text - Text to check
     * @returns {boolean}
     */
    containsURL(text) {
        const urlPattern = /https?:\/\/|www\.|[a-zA-Z0-9-]+\.(com|org|net|io|co|in|edu|gov)/i;
        return urlPattern.test(text);
    }
    
    /**
     * Show URL warning
     */
    showURLWarning() {
        // Only show once per session
        if (this.urlWarningShown) return;
        
        this.urlWarningShown = true;
        showToast('⚠️ Links are not allowed in messages', 'warning');
        
        // Reset after 30 seconds
        setTimeout(() => {
            this.urlWarningShown = false;
        }, 30000);
    }
    
    // ============================================
    // USER STATUS
    // ============================================
    
    /**
     * Update user online status
     * @param {string} status - Status (online, offline, away)
     */
    async updateUserStatus(status) {
        const user = getCurrentUser();
        if (!user) return;
        
        try {
            await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
                status: status === 'offline' ? 'active' : status,
                lastActive: serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    }
    
    // ============================================
    // UTILITY METHODS
    // ============================================
    
    /**
     * Show loading state
     */
    showLoadingState() {
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = 'flex';
        }
        
        if (this.elements.emptyState) {
            this.elements.emptyState.style.display = 'none';
        }
    }
    
    /**
     * Hide loading state
     */
    hideLoadingState() {
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = 'none';
        }
        
        // Show empty state if no messages
        if (this.state.messages.length === 0) {
            if (this.elements.emptyState) {
                this.elements.emptyState.style.display = 'flex';
            }
        } else {
            if (this.elements.emptyState) {
                this.elements.emptyState.style.display = 'none';
            }
        }
    }
    
    /**
     * Show error state
     * @param {string} message - Error message
     */
    showErrorState(message) {
        this.hideLoadingState();
        showToast(message, 'error');
    }
    
    /**
     * Show auth required state
     */
    showAuthRequired() {
        if (this.elements.messagesContainer) {
            this.elements.messagesContainer.innerHTML = `
                <div class="chat-empty">
                    <span class="chat-empty-icon">🔐</span>
                    <h3 class="chat-empty-title">Login Required</h3>
                    <p class="chat-empty-text">Please login to view and send messages</p>
                    <a href="login.html" class="neu-button neu-button-primary mt-lg">
                        Login
                    </a>
                </div>
            `;
        }
        
        if (this.elements.inputContainer) {
            this.elements.inputContainer.style.display = 'none';
        }
    }
    
    /**
     * Play notification sound
     */
    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkI2Coverage');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {
            // Ignore audio errors
        }
    }
    
    /**
     * Add event listener
     * @param {Function} callback - Callback function
     * @returns {Function} - Unsubscribe function
     */
    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
            
            return () => {
                this.listeners = this.listeners.filter(cb => cb !== callback);
            };
        }
        return () => {};
    }
    
    /**
     * Notify listeners
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    notifyListeners(event, data = null) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {
                console.error('Chat listener error:', e);
            }
        });
    }
    
    /**
     * Cleanup chat
     */
    destroy() {
        // Unsubscribe listeners
        if (this.state.unsubscribeMessages) {
            this.state.unsubscribeMessages();
        }
        
        if (this.state.unsubscribePinned) {
            this.state.unsubscribePinned();
        }
        
        // Clear timers
        if (this.state.cooldownTimer) {
            clearInterval(this.state.cooldownTimer);
        }
        
        // Update status
        this.updateUserStatus('offline');
        
        // Reset state
        this.state = {
            isInitialized: false,
            isLoading: false,
            isSending: false,
            messages: [],
            pinnedMessages: []
        };
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================
const chatManager = new ChatManager();

// ============================================
// EXPORTS FOR PART 1
// ============================================
export {
    ChatManager,
    chatManager,
    CHAT_CONFIG,
    chatState,
    elements
};

console.log('💬 Chat System (Part 1) - Core functionality loaded');

/**
 * ============================================
 * STUDY HUB - Chat System
 * ============================================
 * Part 2: Message Rendering, Images, Pinned Messages
 * 
 * Features:
 * - Message bubble rendering
 * - Image upload & display
 * - Pinned messages
 * - Scroll management
 * - Lightbox for images
 * ============================================
 */

import {
    db,
    storage,
    collection,
    doc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    COLLECTIONS,
    formatTimestamp,
    timeAgo
} from './firebase-config.js';

import {
    getCurrentUser,
    getCurrentUserData,
    isAdmin
} from './auth.js';

import {
    chatManager,
    CHAT_CONFIG,
    chatState,
    elements
} from './chat.js';

// ============================================
// EXTEND CHAT MANAGER WITH PART 2 METHODS
// ============================================

/**
 * Render all messages
 * @param {Array} messages - Messages array
 */
chatManager.renderMessages = function(messages) {
    if (!this.elements.messagesContainer) return;
    
    // Clear existing messages
    this.elements.messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        this.showEmptyState();
        return;
    }
    
    // Group messages by date
    const groupedMessages = this.groupMessagesByDate(messages);
    
    // Render each group
    Object.entries(groupedMessages).forEach(([date, dateMessages]) => {
        // Add date separator
        this.renderDateSeparator(date);
        
        // Render messages for this date
        dateMessages.forEach((message, index) => {
            const prevMessage = index > 0 ? dateMessages[index - 1] : null;
            this.renderMessage(message, prevMessage);
        });
    });
    
    // Scroll to bottom if at bottom
    if (this.state.isAtBottom) {
        this.scrollToBottom(false);
    }
};

/**
 * Group messages by date
 * @param {Array} messages - Messages array
 * @returns {Object} - Grouped messages
 */
chatManager.groupMessagesByDate = function(messages) {
    const groups = {};
    
    messages.forEach(message => {
        if (!message.timestamp) return;
        
        const date = message.timestamp.toDate ? 
            message.timestamp.toDate() : new Date(message.timestamp);
        
        const dateKey = this.getDateKey(date);
        
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        
        groups[dateKey].push(message);
    });
    
    return groups;
};

/**
 * Get date key for grouping
 * @param {Date} date - Date object
 * @returns {string} - Date key
 */
chatManager.getDateKey = function(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    if (isToday) {
        return 'Today';
    } else if (isYesterday) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
};

/**
 * Render date separator
 * @param {string} date - Date string
 */
chatManager.renderDateSeparator = function(date) {
    const separator = document.createElement('div');
    separator.className = 'date-separator';
    separator.innerHTML = `
        <span class="date-separator-text">${date}</span>
    `;
    
    this.elements.messagesContainer.appendChild(separator);
};

/**
 * Render single message
 * @param {Object} message - Message data
 * @param {Object} prevMessage - Previous message (for grouping)
 */
chatManager.renderMessage = function(message, prevMessage = null) {
    const currentUser = getCurrentUser();
    const isSent = message.senderId === currentUser?.uid;
    const isAdminMessage = message.senderRole === 'admin' || message.isAdminReply;
    
    // Check if should group with previous message
    const shouldGroup = this.shouldGroupMessages(message, prevMessage);
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    messageEl.dataset.messageId = message.id;
    
    if (isAdminMessage) {
        messageEl.classList.add('admin');
    }
    
    if (message.isAdminReply) {
        messageEl.classList.add('admin-reply');
    }
    
    if (shouldGroup) {
        messageEl.classList.add('grouped');
    }
    
    // Build message HTML
    let messageHTML = '';
    
    // Avatar (only if not grouped)
    if (!shouldGroup) {
        messageHTML += `
            <img 
                src="${this.escapeHTML(message.senderAvatar)}" 
                alt="${this.escapeHTML(message.senderName)}"
                class="message-avatar ${message.senderGender || ''}"
                loading="lazy"
            >
        `;
    } else {
        // Spacer for alignment
        messageHTML += `<div class="message-avatar-spacer"></div>`;
    }
    
    // Message content
    messageHTML += `<div class="message-content">`;
    
    // Header (only if not grouped)
    if (!shouldGroup) {
        messageHTML += `
            <div class="message-header">
                <span class="message-username ${message.senderGender || ''}">
                    ${this.escapeHTML(message.senderName)}
                </span>
                ${isAdminMessage ? '<span class="admin-badge">Admin</span>' : ''}
                <span class="message-time">${this.formatMessageTime(message.timestamp)}</span>
            </div>
        `;
    }
    
    // Message bubble
    messageHTML += `<div class="message-bubble">`;
    
    // Reply reference (for admin replies)
    if (message.isAdminReply && message.replyToContent) {
        messageHTML += `
            <div class="reply-reference">
                <span class="reply-reference-icon">↩️</span>
                <div class="reply-reference-content">
                    <span class="reply-reference-username">
                        ${this.escapeHTML(message.replyToUsername || 'User')}
                    </span>
                    <p class="reply-reference-text">
                        ${this.escapeHTML(this.truncateText(message.replyToContent, 100))}
                    </p>
                </div>
            </div>
        `;
    }
    
    // Message text
    if (message.content) {
        messageHTML += `
            <p class="message-text">${this.formatMessageText(message.content)}</p>
        `;
    }
    
    // Message image
    if (message.imageURL) {
        messageHTML += `
            <div class="message-image-container">
                <img 
                    src="${this.escapeHTML(message.imageURL)}" 
                    alt="Shared image"
                    class="message-image"
                    loading="lazy"
                    onclick="chatManager.openLightbox('${this.escapeHTML(message.imageURL)}')"
                >
            </div>
        `;
    }
    
    messageHTML += `</div>`; // Close bubble
    
    // Grouped message time (show on hover)
    if (shouldGroup) {
        messageHTML += `
            <span class="message-time-hover">${this.formatMessageTime(message.timestamp)}</span>
        `;
    }
    
    messageHTML += `</div>`; // Close content
    
    messageEl.innerHTML = messageHTML;
    
    // Add to container
    this.elements.messagesContainer.appendChild(messageEl);
    
    // Animate new message
    if (!this.state.isLoading) {
        messageEl.classList.add('animate-slideInUp');
    }
};

/**
 * Check if messages should be grouped
 * @param {Object} current - Current message
 * @param {Object} prev - Previous message
 * @returns {boolean}
 */
chatManager.shouldGroupMessages = function(current, prev) {
    if (!prev) return false;
    
    // Must be same sender
    if (current.senderId !== prev.senderId) return false;
    
    // Must be within 2 minutes
    const currentTime = current.timestamp?.toDate ? 
        current.timestamp.toDate() : new Date(current.timestamp);
    const prevTime = prev.timestamp?.toDate ? 
        prev.timestamp.toDate() : new Date(prev.timestamp);
    
    const diffMinutes = (currentTime - prevTime) / (1000 * 60);
    
    return diffMinutes < 2;
};

/**
 * Format message time
 * @param {Timestamp} timestamp - Firebase timestamp
 * @returns {string}
 */
chatManager.formatMessageTime = function(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

/**
 * Format message text with links disabled
 * @param {string} text - Message text
 * @returns {string}
 */
chatManager.formatMessageText = function(text) {
    if (!text) return '';
    
    // Escape HTML
    let formatted = this.escapeHTML(text);
    
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Bold text: *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // Italic text: _text_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    return formatted;
};

/**
 * Prepend older messages (for pagination)
 * @param {Array} messages - Messages to prepend
 */
chatManager.prependMessages = function(messages) {
    if (!this.elements.messagesContainer || messages.length === 0) return;
    
    // Store current scroll position
    const container = this.elements.messagesContainer;
    const previousHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;
    
    // Create fragment for efficiency
    const fragment = document.createDocumentFragment();
    
    messages.forEach((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const messageEl = this.createMessageElement(message, prevMessage);
        fragment.appendChild(messageEl);
    });
    
    // Add date separator at the beginning
    const firstMessage = messages[0];
    if (firstMessage?.timestamp) {
        const date = firstMessage.timestamp.toDate ? 
            firstMessage.timestamp.toDate() : new Date(firstMessage.timestamp);
        const dateKey = this.getDateKey(date);
        
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.innerHTML = `<span class="date-separator-text">${dateKey}</span>`;
        fragment.insertBefore(separator, fragment.firstChild);
    }
    
    // Prepend to container
    container.insertBefore(fragment, container.firstChild);
    
    // Maintain scroll position
    const newHeight = container.scrollHeight;
    container.scrollTop = previousScrollTop + (newHeight - previousHeight);
};

/**
 * Create message element (used for prepending)
 * @param {Object} message - Message data
 * @param {Object} prevMessage - Previous message
 * @returns {HTMLElement}
 */
chatManager.createMessageElement = function(message, prevMessage) {
    const container = document.createElement('div');
    
    // Temporarily use renderMessage logic
    const currentUser = getCurrentUser();
    const isSent = message.senderId === currentUser?.uid;
    const isAdminMessage = message.senderRole === 'admin' || message.isAdminReply;
    const shouldGroup = this.shouldGroupMessages(message, prevMessage);
    
    container.className = `message ${isSent ? 'sent' : 'received'}`;
    container.dataset.messageId = message.id;
    
    if (isAdminMessage) container.classList.add('admin');
    if (message.isAdminReply) container.classList.add('admin-reply');
    if (shouldGroup) container.classList.add('grouped');
    
    // Build HTML (same as renderMessage)
    let html = '';
    
    if (!shouldGroup) {
        html += `
            <img 
                src="${this.escapeHTML(message.senderAvatar)}" 
                alt="${this.escapeHTML(message.senderName)}"
                class="message-avatar ${message.senderGender || ''}"
                loading="lazy"
            >
        `;
    } else {
        html += `<div class="message-avatar-spacer"></div>`;
    }
    
    html += `<div class="message-content">`;
    
    if (!shouldGroup) {
        html += `
            <div class="message-header">
                <span class="message-username ${message.senderGender || ''}">
                    ${this.escapeHTML(message.senderName)}
                </span>
                ${isAdminMessage ? '<span class="admin-badge">Admin</span>' : ''}
                <span class="message-time">${this.formatMessageTime(message.timestamp)}</span>
            </div>
        `;
    }
    
    html += `<div class="message-bubble">`;
    
    if (message.content) {
        html += `<p class="message-text">${this.formatMessageText(message.content)}</p>`;
    }
    
    if (message.imageURL) {
        html += `
            <div class="message-image-container">
                <img 
                    src="${this.escapeHTML(message.imageURL)}" 
                    alt="Shared image"
                    class="message-image"
                    loading="lazy"
                >
            </div>
        `;
    }
    
    html += `</div>`;
    
    if (shouldGroup) {
        html += `<span class="message-time-hover">${this.formatMessageTime(message.timestamp)}</span>`;
    }
    
    html += `</div>`;
    
    container.innerHTML = html;
    
    return container;
};

/**
 * Show empty state
 */
chatManager.showEmptyState = function() {
    if (this.elements.emptyState) {
        this.elements.emptyState.style.display = 'flex';
    }
};

// ============================================
// IMAGE HANDLING
// ============================================

/**
 * Handle image selection
 * @param {Event} e - Change event
 */
chatManager.handleImageSelect = function(e) {
    const file = e.target.files?.[0];
    
    if (!file) return;
    
    // Validate file type
    if (!CHAT_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showToast('Please select a valid image (JPG, PNG, GIF, WebP)', 'error');
        this.clearFileInput();
        return;
    }
    
    // Validate file size
    if (file.size > CHAT_CONFIG.MAX_IMAGE_SIZE) {
        showToast(`Image too large. Maximum size is ${CHAT_CONFIG.MAX_IMAGE_SIZE / (1024 * 1024)}MB`, 'error');
        this.clearFileInput();
        return;
    }
    
    // Store selected image
    this.state.selectedImage = file;
    
    // Show preview
    this.showImagePreview(file);
};

/**
 * Show image preview
 * @param {File} file - Image file
 */
chatManager.showImagePreview = function(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        if (this.elements.imagePreviewContainer) {
            this.elements.imagePreviewContainer.style.display = 'block';
        }
        
        if (this.elements.imagePreview) {
            this.elements.imagePreview.src = e.target.result;
        }
    };
    
    reader.onerror = () => {
        showToast('Failed to load image preview', 'error');
        this.clearSelectedImage();
    };
    
    reader.readAsDataURL(file);
};

/**
 * Clear selected image
 */
chatManager.clearSelectedImage = function() {
    this.state.selectedImage = null;
    
    if (this.elements.imagePreviewContainer) {
        this.elements.imagePreviewContainer.style.display = 'none';
    }
    
    if (this.elements.imagePreview) {
        this.elements.imagePreview.src = '';
    }
    
    this.clearFileInput();
};

/**
 * Clear file input
 */
chatManager.clearFileInput = function() {
    if (this.elements.fileInput) {
        this.elements.fileInput.value = '';
    }
};

/**
 * Upload message image
 * @returns {Promise<string|null>} - Download URL or null
 */
chatManager.uploadMessageImage = async function() {
    if (!this.state.selectedImage) return null;
    
    const user = getCurrentUser();
    if (!user) return null;
    
    try {
        // Compress image before upload
        const compressedImage = await this.compressImage(this.state.selectedImage);
        
        // Create storage reference
        const fileName = `msg_${user.uid}_${Date.now()}.jpg`;
        const storageRef = ref(storage, `chatImages/${user.uid}/${fileName}`);
        
        // Upload with progress tracking
        const uploadTask = uploadBytesResumable(storageRef, compressedImage, {
            contentType: 'image/jpeg'
        });
        
        return new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    // Progress
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    this.updateUploadProgress(progress);
                },
                (error) => {
                    // Error
                    console.error('Upload error:', error);
                    reject(error);
                },
                async () => {
                    // Complete
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                }
            );
        });
        
    } catch (error) {
        console.error('Error uploading image:', error);
        showToast('Failed to upload image', 'error');
        return null;
    }
};

/**
 * Compress image before upload
 * @param {File} file - Image file
 * @returns {Promise<Blob>} - Compressed image blob
 */
chatManager.compressImage = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;
                
                if (width > CHAT_CONFIG.MAX_IMAGE_DIMENSION || height > CHAT_CONFIG.MAX_IMAGE_DIMENSION) {
                    if (width > height) {
                        height = (height / width) * CHAT_CONFIG.MAX_IMAGE_DIMENSION;
                        width = CHAT_CONFIG.MAX_IMAGE_DIMENSION;
                    } else {
                        width = (width / height) * CHAT_CONFIG.MAX_IMAGE_DIMENSION;
                        height = CHAT_CONFIG.MAX_IMAGE_DIMENSION;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to compress image'));
                        }
                    },
                    'image/jpeg',
                    CHAT_CONFIG.IMAGE_QUALITY
                );
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
};

/**
 * Update upload progress
 * @param {number} progress - Progress percentage
 */
chatManager.updateUploadProgress = function(progress) {
    // Could show progress bar
    console.log(`Upload progress: ${progress.toFixed(1)}%`);
    
    if (this.elements.imagePreviewContainer) {
        const progressEl = this.elements.imagePreviewContainer.querySelector('.upload-progress');
        
        if (!progressEl && progress < 100) {
            // Create progress element
            const progressDiv = document.createElement('div');
            progressDiv.className = 'image-preview-uploading';
            progressDiv.innerHTML = `
                <div class="upload-progress-ring">
                    <span class="upload-progress-text">${Math.round(progress)}%</span>
                </div>
            `;
            this.elements.imagePreviewContainer.appendChild(progressDiv);
        } else if (progressEl) {
            const textEl = progressEl.querySelector('.upload-progress-text');
            if (textEl) {
                textEl.textContent = `${Math.round(progress)}%`;
            }
            
            if (progress >= 100) {
                progressEl.remove();
            }
        }
    }
};

/**
 * Open image lightbox
 * @param {string} imageURL - Image URL
 */
chatManager.openLightbox = function(imageURL) {
    if (!this.elements.lightboxOverlay || !this.elements.lightboxImage) {
        // Create lightbox if doesn't exist
        this.createLightbox();
    }
    
    this.elements.lightboxImage.src = imageURL;
    this.elements.lightboxOverlay.classList.add('active');
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
};

/**
 * Close lightbox
 */
chatManager.closeLightbox = function() {
    if (this.elements.lightboxOverlay) {
        this.elements.lightboxOverlay.classList.remove('active');
    }
    
    // Restore body scroll
    document.body.style.overflow = '';
};

/**
 * Create lightbox element
 */
chatManager.createLightbox = function() {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `
        <button class="lightbox-close">✕</button>
        <img class="lightbox-image" src="" alt="Full size image">
    `;
    
    document.body.appendChild(lightbox);
    
    // Update element references
    this.elements.lightboxOverlay = lightbox;
    this.elements.lightboxImage = lightbox.querySelector('.lightbox-image');
    this.elements.lightboxClose = lightbox.querySelector('.lightbox-close');
    
    // Add event listeners
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === this.elements.lightboxClose) {
            this.closeLightbox();
        }
    });
};

// ============================================
// PINNED MESSAGES
// ============================================

/**
 * Load pinned messages
 */
chatManager.loadPinnedMessages = async function() {
    try {
        const pinnedRef = collection(db, COLLECTIONS.MESSAGES);
        const pinnedQuery = query(
            pinnedRef,
            where('isPinned', '==', true),
            where('isArchived', '==', false),
            orderBy('pinnedAt', 'desc'),
            limit(CHAT_CONFIG.MAX_PINNED_MESSAGES)
        );
        
        // Setup real-time listener for pinned messages
        this.state.unsubscribePinned = onSnapshot(pinnedQuery, (snapshot) => {
            const pinnedMessages = [];
            
            snapshot.forEach(doc => {
                pinnedMessages.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            this.state.pinnedMessages = pinnedMessages;
            this.renderPinnedMessages(pinnedMessages);
        });
        
    } catch (error) {
        console.error('Error loading pinned messages:', error);
    }
};

/**
 * Render pinned messages
 * @param {Array} messages - Pinned messages
 */
chatManager.renderPinnedMessages = function(messages) {
    if (!this.elements.pinnedSection || !this.elements.pinnedList) return;
    
    if (messages.length === 0) {
        this.elements.pinnedSection.style.display = 'none';
        return;
    }
    
    this.elements.pinnedSection.style.display = 'block';
    
    // Update count
    if (this.elements.pinnedCount) {
        this.elements.pinnedCount.textContent = messages.length;
    }
    
    // Render pinned messages
    this.elements.pinnedList.innerHTML = messages.map(message => `
        <div class="pinned-message-item" data-message-id="${message.id}">
            <img 
                src="${this.escapeHTML(message.senderAvatar)}" 
                alt="${this.escapeHTML(message.senderName)}"
                class="pinned-message-avatar"
            >
            <div class="pinned-message-content">
                <div class="pinned-message-header">
                    <span class="pinned-message-username">
                        ${this.escapeHTML(message.senderName)}
                    </span>
                    <span class="message-time">${timeAgo(message.timestamp)}</span>
                </div>
                <p class="pinned-message-text">
                    ${message.imageURL ? '📷 Image' : this.escapeHTML(this.truncateText(message.content, 100))}
                </p>
            </div>
        </div>
    `).join('');
    
    // Add click handlers to scroll to pinned message
    this.elements.pinnedList.querySelectorAll('.pinned-message-item').forEach(item => {
        item.addEventListener('click', () => {
            const messageId = item.dataset.messageId;
            this.scrollToMessage(messageId);
        });
    });
};

/**
 * Toggle pinned section
 */
chatManager.togglePinnedSection = function() {
    if (!this.elements.pinnedSection) return;
    
    this.elements.pinnedSection.classList.toggle('collapsed');
};

/**
 * Scroll to specific message
 * @param {string} messageId - Message ID
 */
chatManager.scrollToMessage = function(messageId) {
    const messageEl = this.elements.messagesContainer?.querySelector(
        `[data-message-id="${messageId}"]`
    );
    
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight message briefly
        messageEl.classList.add('highlighted');
        setTimeout(() => {
            messageEl.classList.remove('highlighted');
        }, 2000);
    }
};

// ============================================
// SCROLL MANAGEMENT
// ============================================

/**
 * Handle scroll events
 */
chatManager.handleScroll = function() {
    if (!this.elements.messagesContainer) return;
    
    const container = this.elements.messagesContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Check if at bottom
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    this.state.isAtBottom = distanceFromBottom < CHAT_CONFIG.SCROLL_THRESHOLD;
    
    // Update scroll button visibility
    this.updateScrollButton(!this.state.isAtBottom);
    
    // Reset new message count when scrolling to bottom
    if (this.state.isAtBottom) {
        this.state.newMessageCount = 0;
        this.updateNewMessageIndicator();
    }
    
    // Check if should load more messages (near top)
    if (scrollTop < CHAT_CONFIG.LOAD_MORE_THRESHOLD && !this.state.isLoading) {
        this.loadMoreMessages();
    }
};

/**
 * Scroll to bottom
 * @param {boolean} smooth - Use smooth scrolling
 */
chatManager.scrollToBottom = function(smooth = true) {
    if (!this.elements.messagesContainer) return;
    
    const container = this.elements.messagesContainer;
    
    if (smooth) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        container.scrollTop = container.scrollHeight;
    }
    
    this.state.isAtBottom = true;
    this.state.newMessageCount = 0;
    this.updateScrollButton(false);
    this.updateNewMessageIndicator();
};

/**
 * Update scroll button visibility
 * @param {boolean} show - Whether to show
 */
chatManager.updateScrollButton = function(show) {
    if (!this.elements.scrollButton) return;
    
    if (show) {
        this.elements.scrollButton.classList.add('visible');
    } else {
        this.elements.scrollButton.classList.remove('visible');
    }
};

/**
 * Update new message indicator
 */
chatManager.updateNewMessageIndicator = function() {
    if (!this.elements.newMessageIndicator) return;
    
    if (this.state.newMessageCount > 0) {
        this.elements.newMessageIndicator.textContent = this.state.newMessageCount > 9 ? 
            '9+' : this.state.newMessageCount;
        this.elements.newMessageIndicator.style.display = 'flex';
    } else {
        this.elements.newMessageIndicator.style.display = 'none';
    }
};

// ============================================
// UTILITY METHODS
// ============================================

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string}
 */
chatManager.escapeHTML = function(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
chatManager.truncateText = function(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

// ============================================
// SYSTEM MESSAGES
// ============================================

/**
 * Add system message
 * @param {string} message - Message text
 * @param {string} type - Message type (info, warning, error, success)
 */
chatManager.addSystemMessage = function(message, type = 'info') {
    if (!this.elements.messagesContainer) return;
    
    const systemMsg = document.createElement('div');
    systemMsg.className = `system-message ${type}`;
    systemMsg.textContent = message;
    
    this.elements.messagesContainer.appendChild(systemMsg);
    
    if (this.state.isAtBottom) {
        this.scrollToBottom(false);
    }
};

// ============================================
// INJECT ADDITIONAL STYLES
// ============================================
(function injectChatStyles() {
    if (document.getElementById('chat-extra-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'chat-extra-styles';
    style.textContent = `
        /* Message Avatar Spacer (for grouped messages) */
        .message-avatar-spacer {
            width: 40px;
            flex-shrink: 0;
        }
        
        @media (max-width: 768px) {
            .message-avatar-spacer {
                width: 32px;
            }
        }
        
        /* Grouped Message Styles */
        .message.grouped {
            margin-top: -8px;
        }
        
        .message.grouped .message-bubble {
            border-top-left-radius: var(--radius-lg);
            border-top-right-radius: var(--radius-lg);
        }
        
        .message.sent.grouped .message-bubble {
            border-bottom-right-radius: var(--radius-lg);
        }
        
        .message.received.grouped .message-bubble {
            border-bottom-left-radius: var(--radius-lg);
        }
        
        /* Hover Time for Grouped Messages */
        .message-time-hover {
            display: none;
            font-size: var(--font-size-xs);
            color: var(--text-tertiary);
            margin-left: var(--space-sm);
            align-self: center;
        }
        
        .message.grouped:hover .message-time-hover {
            display: inline;
        }
        
        /* Highlighted Message */
        .message.highlighted .message-bubble {
            animation: highlightPulse 2s ease;
        }
        
        @keyframes highlightPulse {
            0%, 100% {
                box-shadow: var(--neu-shadow-md);
            }
            50% {
                box-shadow: 0 0 0 4px var(--accent-primary-light), var(--neu-shadow-md);
            }
        }
        
        /* Upload Progress */
        .image-preview-uploading {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .upload-progress-ring {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: var(--accent-primary);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .upload-progress-text {
            color: white;
            font-size: var(--font-size-sm);
            font-weight: var(--font-weight-semibold);
        }
        
        /* Image Preview Container */
        .image-preview-container {
            display: none;
            position: relative;
            padding: var(--space-md);
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            margin-bottom: var(--space-sm);
        }
        
        .image-preview-wrapper {
            position: relative;
            display: inline-block;
        }
        
        .image-preview-img {
            max-width: 200px;
            max-height: 150px;
            border-radius: var(--radius-sm);
            object-fit: contain;
        }
        
        /* Cooldown Overlay */
        .cooldown-overlay {
            position: absolute;
            inset: 0;
            background: var(--bg-primary);
            display: none;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
            font-size: var(--font-size-sm);
            color: var(--text-tertiary);
            border-radius: var(--radius-lg);
            z-index: 5;
        }
        
        .cooldown-timer {
            font-weight: var(--font-weight-semibold);
            color: var(--accent-primary);
        }
        
        /* Chat Input Field Container */
        .chat-input-field {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--bg-primary);
            border-radius: var(--radius-lg);
            box-shadow: var(--neu-inset-md);
            overflow: hidden;
            position: relative;
        }
        
        /* File Input Hidden */
        #imageInput {
            display: none;
        }
    `;
    
    document.head.appendChild(style);
})();

// ============================================
// INITIALIZE CHAT ON PAGE LOAD
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if on chat page
    if (document.querySelector('.chat-wrapper') || document.querySelector('.chat-container')) {
        // Initialize after auth is ready
        setTimeout(() => {
            chatManager.init();
        }, 500);
    }
});

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Send a message programmatically
 * @param {string} text - Message text
 */
function sendChatMessage(text) {
    if (chatManager.elements.inputField) {
        chatManager.elements.inputField.value = text;
        chatManager.sendMessage();
    }
}

/**
 * Get chat messages
 * @returns {Array}
 */
function getChatMessages() {
    return [...chatManager.state.messages];
}

/**
 * Scroll chat to bottom
 */
function scrollChatToBottom() {
    chatManager.scrollToBottom(true);
}

// ============================================
// EXPORTS
// ============================================
export {
    // Manager
    chatManager,
    
    // Configuration
    CHAT_CONFIG,
    
    // Convenience functions
    sendChatMessage,
    getChatMessages,
    scrollChatToBottom
};

// ============================================
// GLOBAL ACCESS
// ============================================
if (typeof window !== 'undefined') {
    window.StudyHubChat = {
        manager: chatManager,
        send: sendChatMessage,
        getMessages: getChatMessages,
        scrollToBottom: scrollChatToBottom,
        openLightbox: (url) => chatManager.openLightbox(url)
    };
}

console.log('💬 Chat System (Part 2) - Rendering & UI loaded');