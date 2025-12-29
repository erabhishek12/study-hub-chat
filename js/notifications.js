/**
 * ============================================
 * STUDY HUB - Notification System
 * ============================================
 * Features:
 * - Header notification bar
 * - Sliding notifications
 * - Multiple notification types
 * - Google Sheets integration
 * - Firestore notifications
 * - Auto-rotation
 * - Click to redirect
 * - Local storage caching
 * ============================================
 */

import {
    db,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    onSnapshot,
    Timestamp
} from './firebase-config.js';

// ============================================
// NOTIFICATION CONFIGURATION
// ============================================
const NOTIFICATION_CONFIG = {
    // Rotation settings
    ROTATION_INTERVAL: 8000, // 8 seconds between notifications
    ANIMATION_DURATION: 500, // Animation duration in ms
    
    // Cache settings
    CACHE_KEY: 'studyhub_notifications',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    
    // Google Sheets settings (optional)
    GOOGLE_SHEETS_URL: null, // Set your published Google Sheets URL
    SHEETS_FETCH_INTERVAL: 10 * 60 * 1000, // 10 minutes
    
    // Display settings
    MAX_NOTIFICATIONS: 10,
    AUTO_DISMISS_DELAY: 0, // 0 = don't auto dismiss
    
    // Notification types with icons and colors
    TYPES: {
        notes: {
            icon: '📚',
            label: 'New Notes',
            className: 'notification-notes',
            color: '#6c63ff'
        },
        video: {
            icon: '🎬',
            label: 'New Video',
            className: 'notification-video',
            color: '#e74c3c'
        },
        lecture: {
            icon: '🎓',
            label: 'Live Lecture',
            className: 'notification-lecture',
            color: '#2ed573'
        },
        general: {
            icon: '📢',
            label: 'Announcement',
            className: 'notification-general',
            color: '#ffa502'
        },
        update: {
            icon: '🔄',
            label: 'Update',
            className: 'notification-update',
            color: '#3498db'
        },
        alert: {
            icon: '⚠️',
            label: 'Alert',
            className: 'notification-alert',
            color: '#ff4757'
        }
    }
};

// ============================================
// NOTIFICATION MANAGER CLASS
// ============================================
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.currentIndex = 0;
        this.rotationTimer = null;
        this.isVisible = false;
        this.isPaused = false;
        this.notificationBar = null;
        this.unsubscribe = null;
        this.listeners = [];
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Initialize notification system
     */
    async init() {
        console.log('🔔 Initializing Notification System...');
        
        // Create notification bar element
        this.createNotificationBar();
        
        // Load cached notifications first (for instant display)
        this.loadFromCache();
        
        // Fetch fresh notifications
        await this.fetchNotifications();
        
        // Setup real-time listener
        this.setupRealtimeListener();
        
        // Setup Google Sheets integration if configured
        if (NOTIFICATION_CONFIG.GOOGLE_SHEETS_URL) {
            this.fetchFromGoogleSheets();
            setInterval(() => this.fetchFromGoogleSheets(), 
                NOTIFICATION_CONFIG.SHEETS_FETCH_INTERVAL);
        }
        
        console.log('🔔 Notification System initialized');
    }
    
    /**
     * Create notification bar HTML
     */
    createNotificationBar() {
        // Remove existing bar
        document.querySelector('.notification-bar')?.remove();
        
        // Create bar element
        const bar = document.createElement('div');
        bar.className = 'notification-bar';
        bar.innerHTML = `
            <span class="notification-icon"></span>
            <div class="notification-content">
                <span class="notification-label"></span>
                <span class="notification-title"></span>
                <span class="notification-text"></span>
                <a class="notification-link" href="#" target="_blank">View →</a>
            </div>
            <div class="notification-controls">
                <button class="notification-nav notification-prev" title="Previous">❮</button>
                <span class="notification-counter">1/1</span>
                <button class="notification-nav notification-next" title="Next">❯</button>
            </div>
            <button class="notification-close" title="Dismiss">✕</button>
        `;
        
        // Insert at beginning of body
        document.body.insertBefore(bar, document.body.firstChild);
        
        this.notificationBar = bar;
        
        // Setup event listeners
        this.setupBarEventListeners();
        
        // Inject styles
        this.injectStyles();
    }
    
    /**
     * Inject notification styles
     */
    injectStyles() {
        if (document.getElementById('notification-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            /* Notification Bar */
            .notification-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 20px;
                background: var(--accent-primary, #6c63ff);
                color: white;
                font-size: 14px;
                transform: translateY(-100%);
                transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                            background-color 0.3s ease;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            }
            
            .notification-bar.active {
                transform: translateY(0);
            }
            
            /* Notification Types */
            .notification-bar.notification-notes {
                background: linear-gradient(135deg, #6c63ff 0%, #5a52d9 100%);
            }
            
            .notification-bar.notification-video {
                background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            }
            
            .notification-bar.notification-lecture {
                background: linear-gradient(135deg, #2ed573 0%, #26b75e 100%);
            }
            
            .notification-bar.notification-general {
                background: linear-gradient(135deg, #ffa502 0%, #e69500 100%);
                color: #333;
            }
            
            .notification-bar.notification-update {
                background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
            }
            
            .notification-bar.notification-alert {
                background: linear-gradient(135deg, #ff4757 0%, #e8303f 100%);
            }
            
            /* Icon */
            .notification-icon {
                font-size: 24px;
                flex-shrink: 0;
                animation: notificationBounce 2s ease infinite;
            }
            
            @keyframes notificationBounce {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            /* Content */
            .notification-content {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                overflow: hidden;
                min-width: 0;
            }
            
            .notification-label {
                background: rgba(255, 255, 255, 0.2);
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                flex-shrink: 0;
            }
            
            .notification-title {
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .notification-text {
                opacity: 0.9;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .notification-link {
                color: inherit;
                font-weight: 600;
                text-decoration: none;
                white-space: nowrap;
                padding: 4px 12px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                transition: background 0.2s;
                flex-shrink: 0;
            }
            
            .notification-link:hover {
                background: rgba(255, 255, 255, 0.3);
                text-decoration: none;
            }
            
            .notification-bar.notification-general .notification-link {
                background: rgba(0, 0, 0, 0.1);
            }
            
            /* Controls */
            .notification-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            
            .notification-nav {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: inherit;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                transition: background 0.2s, transform 0.2s;
            }
            
            .notification-nav:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: scale(1.1);
            }
            
            .notification-counter {
                font-size: 12px;
                opacity: 0.8;
                min-width: 30px;
                text-align: center;
            }
            
            .notification-controls.hidden {
                display: none;
            }
            
            /* Close Button */
            .notification-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: inherit;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                transition: background 0.2s, transform 0.2s;
                flex-shrink: 0;
            }
            
            .notification-close:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: scale(1.1);
            }
            
            /* Slide Animation */
            .notification-bar.slide-out {
                animation: slideOut 0.3s ease forwards;
            }
            
            .notification-bar.slide-in {
                animation: slideIn 0.3s ease forwards;
            }
            
            @keyframes slideOut {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(-20px); opacity: 0; }
            }
            
            @keyframes slideIn {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            /* Progress Bar */
            .notification-bar::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.5);
                width: 0%;
                animation: notificationProgress ${NOTIFICATION_CONFIG.ROTATION_INTERVAL}ms linear forwards;
            }
            
            .notification-bar.paused::after {
                animation-play-state: paused;
            }
            
            @keyframes notificationProgress {
                from { width: 0%; }
                to { width: 100%; }
            }
            
            /* Responsive */
            @media (max-width: 768px) {
                .notification-bar {
                    padding: 8px 12px;
                    font-size: 13px;
                    gap: 8px;
                }
                
                .notification-text {
                    display: none;
                }
                
                .notification-label {
                    display: none;
                }
                
                .notification-controls {
                    display: none;
                }
                
                .notification-icon {
                    font-size: 20px;
                }
            }
            
            @media (max-width: 480px) {
                .notification-bar {
                    flex-wrap: wrap;
                    padding: 10px;
                }
                
                .notification-content {
                    order: 2;
                    width: 100%;
                    justify-content: center;
                    margin-top: 4px;
                }
                
                .notification-title {
                    font-size: 12px;
                }
            }
            
            /* Dark mode adjustments */
            [data-theme="dark"] .notification-bar {
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            }
            
            /* Offset content when notification is visible */
            body.has-notification {
                padding-top: 50px;
            }
            
            body.has-notification .header,
            body.has-notification .chat-header {
                top: 50px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Setup event listeners for notification bar
     */
    setupBarEventListeners() {
        if (!this.notificationBar) return;
        
        // Close button
        const closeBtn = this.notificationBar.querySelector('.notification-close');
        closeBtn?.addEventListener('click', () => this.dismiss());
        
        // Navigation buttons
        const prevBtn = this.notificationBar.querySelector('.notification-prev');
        const nextBtn = this.notificationBar.querySelector('.notification-next');
        
        prevBtn?.addEventListener('click', () => this.showPrevious());
        nextBtn?.addEventListener('click', () => this.showNext());
        
        // Pause rotation on hover
        this.notificationBar.addEventListener('mouseenter', () => {
            this.pauseRotation();
        });
        
        this.notificationBar.addEventListener('mouseleave', () => {
            this.resumeRotation();
        });
        
        // Link click
        const link = this.notificationBar.querySelector('.notification-link');
        link?.addEventListener('click', (e) => {
            const notification = this.notifications[this.currentIndex];
            if (notification?.link) {
                // Track click
                this.trackNotificationClick(notification);
            } else {
                e.preventDefault();
            }
        });
        
        // Touch swipe support
        let touchStartX = 0;
        let touchEndX = 0;
        
        this.notificationBar.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        this.notificationBar.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    this.showNext();
                } else {
                    this.showPrevious();
                }
            }
        }, { passive: true });
    }
    
    // ============================================
    // FETCH NOTIFICATIONS
    // ============================================
    
    /**
     * Fetch notifications from Firestore
     */
    async fetchNotifications() {
        try {
            const notificationsRef = collection(db, 'notifications');
            const q = query(
                notificationsRef,
                where('isActive', '==', true),
                orderBy('priority', 'desc'),
                orderBy('createdAt', 'desc'),
                limit(NOTIFICATION_CONFIG.MAX_NOTIFICATIONS)
            );
            
            const snapshot = await getDocs(q);
            
            const notifications = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Check expiry
                if (data.expiresAt) {
                    const expiryDate = data.expiresAt.toDate ? 
                        data.expiresAt.toDate() : new Date(data.expiresAt);
                    
                    if (expiryDate < new Date()) {
                        return; // Skip expired
                    }
                }
                
                notifications.push({
                    id: doc.id,
                    ...data
                });
            });
            
            if (notifications.length > 0) {
                this.notifications = notifications;
                this.saveToCache();
                this.showNotifications();
            }
            
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }
    
    /**
     * Setup real-time listener for notifications
     */
    setupRealtimeListener() {
        try {
            const notificationsRef = collection(db, 'notifications');
            const q = query(
                notificationsRef,
                where('isActive', '==', true),
                orderBy('priority', 'desc'),
                orderBy('createdAt', 'desc'),
                limit(NOTIFICATION_CONFIG.MAX_NOTIFICATIONS)
            );
            
            this.unsubscribe = onSnapshot(q, (snapshot) => {
                const notifications = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    
                    // Check expiry
                    if (data.expiresAt) {
                        const expiryDate = data.expiresAt.toDate ? 
                            data.expiresAt.toDate() : new Date(data.expiresAt);
                        
                        if (expiryDate < new Date()) {
                            return;
                        }
                    }
                    
                    notifications.push({
                        id: doc.id,
                        ...data
                    });
                });
                
                // Check for new notifications
                const newNotification = this.findNewNotification(notifications);
                
                this.notifications = notifications;
                this.saveToCache();
                
                if (notifications.length > 0) {
                    // If there's a new notification, show it first
                    if (newNotification) {
                        const index = notifications.findIndex(n => n.id === newNotification.id);
                        if (index >= 0) {
                            this.currentIndex = index;
                        }
                    }
                    
                    this.showNotifications();
                } else {
                    this.hide();
                }
                
            }, (error) => {
                console.error('Notification listener error:', error);
            });
            
        } catch (error) {
            console.error('Error setting up notification listener:', error);
        }
    }
    
    /**
     * Find new notification that wasn't in previous list
     * @param {Array} newNotifications - New notification list
     * @returns {Object|null}
     */
    findNewNotification(newNotifications) {
        const currentIds = new Set(this.notifications.map(n => n.id));
        
        for (const notification of newNotifications) {
            if (!currentIds.has(notification.id)) {
                return notification;
            }
        }
        
        return null;
    }
    
    /**
     * Fetch notifications from Google Sheets
     */
    async fetchFromGoogleSheets() {
        if (!NOTIFICATION_CONFIG.GOOGLE_SHEETS_URL) return;
        
        try {
            const response = await fetch(NOTIFICATION_CONFIG.GOOGLE_SHEETS_URL);
            const text = await response.text();
            
            // Parse CSV or JSON response
            const sheetsNotifications = this.parseGoogleSheetsData(text);
            
            if (sheetsNotifications.length > 0) {
                // Merge with existing notifications
                const existingIds = new Set(this.notifications.map(n => n.id));
                
                sheetsNotifications.forEach(notification => {
                    if (!existingIds.has(notification.id)) {
                        this.notifications.push(notification);
                    }
                });
                
                // Sort by priority
                this.notifications.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                
                this.saveToCache();
                this.showNotifications();
            }
            
        } catch (error) {
            console.error('Error fetching from Google Sheets:', error);
        }
    }
    
    /**
     * Parse Google Sheets data
     * @param {string} data - Raw data from sheets
     * @returns {Array}
     */
    parseGoogleSheetsData(data) {
        try {
            // Try JSON first
            if (data.trim().startsWith('[') || data.trim().startsWith('{')) {
                const json = JSON.parse(data);
                return Array.isArray(json) ? json : [json];
            }
            
            // Parse as CSV
            const lines = data.split('\n');
            if (lines.length < 2) return [];
            
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const notifications = [];
            
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                if (values.length < headers.length) continue;
                
                const notification = {};
                headers.forEach((header, index) => {
                    notification[header] = values[index]?.trim();
                });
                
                // Validate required fields
                if (notification.title && notification.isactive === 'true') {
                    notifications.push({
                        id: `sheets_${i}`,
                        title: notification.title,
                        content: notification.content || '',
                        link: notification.link || '',
                        type: notification.type || 'general',
                        priority: parseInt(notification.priority) || 0,
                        isActive: true,
                        source: 'sheets'
                    });
                }
            }
            
            return notifications;
            
        } catch (error) {
            console.error('Error parsing Google Sheets data:', error);
            return [];
        }
    }
    
    // ============================================
    // DISPLAY METHODS
    // ============================================
    
    /**
     * Show notifications
     */
    showNotifications() {
        if (this.notifications.length === 0) {
            this.hide();
            return;
        }
        
        // Display current notification
        this.displayNotification(this.currentIndex);
        
        // Start rotation if multiple
        if (this.notifications.length > 1) {
            this.startRotation();
        }
        
        // Show bar
        this.show();
    }
    
    /**
     * Display specific notification
     * @param {number} index - Notification index
     */
    displayNotification(index) {
        if (!this.notificationBar || !this.notifications[index]) return;
        
        const notification = this.notifications[index];
        const typeConfig = NOTIFICATION_CONFIG.TYPES[notification.type] || 
                          NOTIFICATION_CONFIG.TYPES.general;
        
        // Update content
        const icon = this.notificationBar.querySelector('.notification-icon');
        const label = this.notificationBar.querySelector('.notification-label');
        const title = this.notificationBar.querySelector('.notification-title');
        const text = this.notificationBar.querySelector('.notification-text');
        const link = this.notificationBar.querySelector('.notification-link');
        const counter = this.notificationBar.querySelector('.notification-counter');
        const controls = this.notificationBar.querySelector('.notification-controls');
        
        if (icon) icon.textContent = notification.icon || typeConfig.icon;
        if (label) label.textContent = typeConfig.label;
        if (title) title.textContent = notification.title;
        if (text) text.textContent = notification.content || '';
        
        if (link) {
            if (notification.link) {
                link.href = notification.link;
                link.style.display = 'inline-flex';
            } else {
                link.style.display = 'none';
            }
        }
        
        if (counter) {
            counter.textContent = `${index + 1}/${this.notifications.length}`;
        }
        
        if (controls) {
            controls.classList.toggle('hidden', this.notifications.length <= 1);
        }
        
        // Update type class
        Object.values(NOTIFICATION_CONFIG.TYPES).forEach(type => {
            this.notificationBar.classList.remove(type.className);
        });
        this.notificationBar.classList.add(typeConfig.className);
        
        // Reset progress animation
        this.resetProgressAnimation();
    }
    
    /**
     * Show notification bar
     */
    show() {
        if (this.isVisible) return;
        
        this.notificationBar?.classList.add('active');
        document.body.classList.add('has-notification');
        this.isVisible = true;
        
        this.notifyListeners('show', this.notifications[this.currentIndex]);
    }
    
    /**
     * Hide notification bar
     */
    hide() {
        this.notificationBar?.classList.remove('active');
        document.body.classList.remove('has-notification');
        this.isVisible = false;
        this.stopRotation();
        
        this.notifyListeners('hide');
    }
    
    /**
     * Dismiss current notification
     */
    dismiss() {
        if (this.notifications.length <= 1) {
            // Hide if only one notification
            this.hide();
            
            // Save dismissal to avoid showing again in this session
            const current = this.notifications[this.currentIndex];
            if (current) {
                this.saveDismissal(current.id);
            }
        } else {
            // Remove current and show next
            const dismissedId = this.notifications[this.currentIndex]?.id;
            this.notifications.splice(this.currentIndex, 1);
            
            if (this.currentIndex >= this.notifications.length) {
                this.currentIndex = 0;
            }
            
            this.saveDismissal(dismissedId);
            this.displayNotification(this.currentIndex);
        }
        
        this.notifyListeners('dismiss');
    }
    
    /**
     * Show next notification
     */
    showNext() {
        if (this.notifications.length <= 1) return;
        
        this.currentIndex = (this.currentIndex + 1) % this.notifications.length;
        this.animateTransition('next');
    }
    
    /**
     * Show previous notification
     */
    showPrevious() {
        if (this.notifications.length <= 1) return;
        
        this.currentIndex = this.currentIndex === 0 ? 
            this.notifications.length - 1 : 
            this.currentIndex - 1;
        this.animateTransition('prev');
    }
    
    /**
     * Animate notification transition
     * @param {string} direction - 'next' or 'prev'
     */
    animateTransition(direction) {
        if (!this.notificationBar) return;
        
        // Slide out
        this.notificationBar.classList.add('slide-out');
        
        setTimeout(() => {
            this.displayNotification(this.currentIndex);
            this.notificationBar.classList.remove('slide-out');
            this.notificationBar.classList.add('slide-in');
            
            setTimeout(() => {
                this.notificationBar.classList.remove('slide-in');
            }, NOTIFICATION_CONFIG.ANIMATION_DURATION);
            
        }, NOTIFICATION_CONFIG.ANIMATION_DURATION);
    }
    
    // ============================================
    // ROTATION
    // ============================================
    
    /**
     * Start notification rotation
     */
    startRotation() {
        this.stopRotation();
        
        if (this.notifications.length <= 1 || this.isPaused) return;
        
        this.rotationTimer = setInterval(() => {
            this.showNext();
        }, NOTIFICATION_CONFIG.ROTATION_INTERVAL);
    }
    
    /**
     * Stop notification rotation
     */
    stopRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    }
    
    /**
     * Pause rotation (on hover)
     */
    pauseRotation() {
        this.isPaused = true;
        this.stopRotation();
        this.notificationBar?.classList.add('paused');
    }
    
    /**
     * Resume rotation (on mouse leave)
     */
    resumeRotation() {
        this.isPaused = false;
        this.notificationBar?.classList.remove('paused');
        
        if (this.notifications.length > 1) {
            this.startRotation();
        }
    }
    
    /**
     * Reset progress bar animation
     */
    resetProgressAnimation() {
        if (!this.notificationBar) return;
        
        // Force reflow to restart animation
        this.notificationBar.style.animation = 'none';
        void this.notificationBar.offsetHeight;
        this.notificationBar.style.animation = '';
    }
    
    // ============================================
    // CACHE & STORAGE
    // ============================================
    
    /**
     * Save notifications to cache
     */
    saveToCache() {
        try {
            const cacheData = {
                notifications: this.notifications,
                timestamp: Date.now()
            };
            
            localStorage.setItem(
                NOTIFICATION_CONFIG.CACHE_KEY, 
                JSON.stringify(cacheData)
            );
        } catch (error) {
            console.warn('Error saving notifications to cache:', error);
        }
    }
    
    /**
     * Load notifications from cache
     */
    loadFromCache() {
        try {
            const cached = localStorage.getItem(NOTIFICATION_CONFIG.CACHE_KEY);
            
            if (cached) {
                const cacheData = JSON.parse(cached);
                
                // Check cache validity
                const age = Date.now() - cacheData.timestamp;
                if (age < NOTIFICATION_CONFIG.CACHE_DURATION) {
                    this.notifications = cacheData.notifications || [];
                    
                    // Filter out dismissed notifications
                    this.notifications = this.notifications.filter(
                        n => !this.isDismissed(n.id)
                    );
                    
                    if (this.notifications.length > 0) {
                        this.showNotifications();
                    }
                }
            }
        } catch (error) {
            console.warn('Error loading notifications from cache:', error);
        }
    }
    
    /**
     * Save notification dismissal
     * @param {string} notificationId - Notification ID
     */
    saveDismissal(notificationId) {
        try {
            const dismissedKey = 'studyhub_dismissed_notifications';
            const dismissed = JSON.parse(
                localStorage.getItem(dismissedKey) || '[]'
            );
            
            if (!dismissed.includes(notificationId)) {
                dismissed.push(notificationId);
                localStorage.setItem(dismissedKey, JSON.stringify(dismissed));
            }
        } catch (error) {
            console.warn('Error saving dismissal:', error);
        }
    }
    
    /**
     * Check if notification was dismissed
     * @param {string} notificationId - Notification ID
     * @returns {boolean}
     */
    isDismissed(notificationId) {
        try {
            const dismissedKey = 'studyhub_dismissed_notifications';
            const dismissed = JSON.parse(
                localStorage.getItem(dismissedKey) || '[]'
            );
            
            return dismissed.includes(notificationId);
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Clear all dismissals
     */
    clearDismissals() {
        try {
            localStorage.removeItem('studyhub_dismissed_notifications');
        } catch (error) {
            console.warn('Error clearing dismissals:', error);
        }
    }
    
    // ============================================
    // UTILITIES
    // ============================================
    
    /**
     * Track notification click
     * @param {Object} notification - Clicked notification
     */
    trackNotificationClick(notification) {
        console.log('📊 Notification clicked:', notification.id);
        this.notifyListeners('click', notification);
    }
    
    /**
     * Add notification manually
     * @param {Object} notification - Notification data
     */
    addNotification(notification) {
        const fullNotification = {
            id: notification.id || `manual_${Date.now()}`,
            title: notification.title,
            content: notification.content || '',
            link: notification.link || '',
            type: notification.type || 'general',
            icon: notification.icon,
            priority: notification.priority || 0,
            isActive: true,
            createdAt: new Date()
        };
        
        // Add to beginning
        this.notifications.unshift(fullNotification);
        this.currentIndex = 0;
        this.showNotifications();
        
        return fullNotification;
    }
    
    /**
     * Remove notification by ID
     * @param {string} notificationId - Notification ID
     */
    removeNotification(notificationId) {
        const index = this.notifications.findIndex(n => n.id === notificationId);
        
        if (index >= 0) {
            this.notifications.splice(index, 1);
            
            if (this.currentIndex >= this.notifications.length) {
                this.currentIndex = 0;
            }
            
            if (this.notifications.length > 0) {
                this.displayNotification(this.currentIndex);
            } else {
                this.hide();
            }
        }
    }
    
    /**
     * Get all notifications
     * @returns {Array}
     */
    getNotifications() {
        return [...this.notifications];
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
     * Notify all listeners
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    notifyListeners(event, data = null) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {
                console.error('Notification listener error:', e);
            }
        });
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.stopRotation();
        
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        this.notificationBar?.remove();
        document.getElementById('notification-styles')?.remove();
        document.body.classList.remove('has-notification');
        
        this.notifications = [];
        this.listeners = [];
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================
const notificationManager = new NotificationManager();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Show a quick notification
 * @param {Object} options - Notification options
 */
function showNotification(options) {
    return notificationManager.addNotification(options);
}

/**
 * Hide all notifications
 */
function hideNotifications() {
    notificationManager.hide();
}

/**
 * Get notification manager instance
 * @returns {NotificationManager}
 */
function getNotificationManager() {
    return notificationManager;
}

// ============================================
// EXPORTS
// ============================================
export {
    // Manager
    NotificationManager,
    notificationManager,
    
    // Configuration
    NOTIFICATION_CONFIG,
    
    // Convenience functions
    showNotification,
    hideNotifications,
    getNotificationManager
};

// ============================================
// GLOBAL ACCESS
// ============================================
if (typeof window !== 'undefined') {
    window.StudyHubNotifications = {
        show: showNotification,
        hide: hideNotifications,
        manager: notificationManager,
        getAll: () => notificationManager.getNotifications(),
        onEvent: (cb) => notificationManager.addListener(cb)
    };
}

console.log('🔔 Notification System loaded');