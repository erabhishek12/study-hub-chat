/**
 * ============================================
 * STUDY HUB - Admin Panel System
 * ============================================
 * Part 1: Dashboard & User Management
 * 
 * Features:
 * - Dashboard statistics
 * - User listing with search/filter
 * - User actions (mute, ban, delete)
 * - User profile viewing
 * - Real-time updates
 * ============================================
 */

import {
    auth,
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
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
    writeBatch,
    COLLECTIONS,
    formatTimestamp,
    timeAgo
} from './firebase-config.js';

import {
    getCurrentUser,
    getCurrentUserData,
    isAdmin,
    showToast
} from './auth.js';

// ============================================
// ADMIN CONFIGURATION
// ============================================
const ADMIN_CONFIG = {
    // Pagination
    USERS_PER_PAGE: 20,
    MESSAGES_PER_PAGE: 50,
    ARCHIVED_PER_PAGE: 30,
    
    // Refresh intervals
    STATS_REFRESH_INTERVAL: 30000, // 30 seconds
    
    // Mute durations (in milliseconds)
    MUTE_DURATIONS: {
        '1hour': 60 * 60 * 1000,
        '24hours': 24 * 60 * 60 * 1000,
        '48hours': 48 * 60 * 60 * 1000,
        '7days': 7 * 24 * 60 * 60 * 1000,
        'custom': null
    },
    
    // Archive reasons
    ARCHIVE_REASONS: {
        abusive: 'Abusive Content',
        spam: 'Spam',
        contact: 'Contact Information',
        url: 'URL/Link',
        manual: 'Manual Removal',
        other: 'Other'
    }
};

// ============================================
// ADMIN STATE
// ============================================
let adminState = {
    isInitialized: false,
    currentSection: 'dashboard',
    users: [],
    messages: [],
    archivedMessages: [],
    notifications: [],
    selectedUser: null,
    selectedMessage: null,
    usersPagination: {
        lastDoc: null,
        hasMore: true
    },
    statsUnsubscribe: null,
    usersUnsubscribe: null,
    messagesUnsubscribe: null,
    filters: {
        userStatus: 'all',
        userRole: 'all',
        searchQuery: ''
    }
};

// DOM Elements cache
let adminElements = {};

// ============================================
// ADMIN MANAGER CLASS
// ============================================
class AdminManager {
    constructor() {
        this.state = adminState;
        this.elements = adminElements;
    }
    
    /**
     * Initialize admin panel
     */
    async init() {
        if (this.state.isInitialized) return;
        
        console.log('👑 Initializing Admin Panel...');
        
        // Verify admin access
        const userData = getCurrentUserData();
        if (!userData || userData.role !== 'admin') {
            console.error('Unauthorized access to admin panel');
            window.location.href = 'index.html';
            return;
        }
        
        // Cache DOM elements
        this.cacheElements();
        
        // Setup sidebar navigation
        this.setupSidebarNavigation();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load dashboard by default
        await this.loadDashboard();
        
        // Setup real-time stats
        this.setupRealtimeStats();
        
        this.state.isInitialized = true;
        console.log('👑 Admin Panel initialized');
    }
    
    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Sidebar
            sidebar: document.querySelector('.admin-sidebar'),
            sidebarToggle: document.querySelector('.sidebar-toggle'),
            sidebarOverlay: document.querySelector('.sidebar-overlay'),
            navItems: document.querySelectorAll('.sidebar-nav-item'),
            
            // Header
            pageTitle: document.querySelector('.admin-page-title'),
            searchInput: document.querySelector('.admin-search-input'),
            
            // Content areas
            mainContent: document.querySelector('.admin-content'),
            dashboardSection: document.querySelector('#dashboardSection'),
            usersSection: document.querySelector('#usersSection'),
            chatSection: document.querySelector('#chatSection'),
            archivedSection: document.querySelector('#archivedSection'),
            notificationsSection: document.querySelector('#notificationsSection'),
            
            // Stats cards
            totalUsersCard: document.querySelector('#totalUsersCount'),
            activeUsersCard: document.querySelector('#activeUsersCount'),
            mutedUsersCard: document.querySelector('#mutedUsersCount'),
            bannedUsersCard: document.querySelector('#bannedUsersCount'),
            totalMessagesCard: document.querySelector('#totalMessagesCount'),
            archivedMessagesCard: document.querySelector('#archivedMessagesCount'),
            
            // Users table
            usersTableBody: document.querySelector('#usersTableBody'),
            userSearchInput: document.querySelector('#userSearchInput'),
            userStatusFilter: document.querySelector('#userStatusFilter'),
            userRoleFilter: document.querySelector('#userRoleFilter'),
            loadMoreUsersBtn: document.querySelector('#loadMoreUsersBtn'),
            
            // Modals
            userDetailModal: document.querySelector('#userDetailModal'),
            muteModal: document.querySelector('#muteModal'),
            banModal: document.querySelector('#banModal'),
            confirmModal: document.querySelector('#confirmModal')
        };
        
        adminElements = this.elements;
    }
    
    /**
     * Setup sidebar navigation
     */
    setupSidebarNavigation() {
        // Sidebar toggle for mobile
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }
        
        // Sidebar overlay click
        if (this.elements.sidebarOverlay) {
            this.elements.sidebarOverlay.addEventListener('click', () => {
                this.closeSidebar();
            });
        }
        
        // Navigation items
        this.elements.navItems?.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                if (section) {
                    this.navigateToSection(section);
                }
            });
        });
    }
    
    /**
     * Toggle sidebar (mobile)
     */
    toggleSidebar() {
        this.elements.sidebar?.classList.toggle('active');
        this.elements.sidebarOverlay?.classList.toggle('active');
    }
    
    /**
     * Close sidebar (mobile)
     */
    closeSidebar() {
        this.elements.sidebar?.classList.remove('active');
        this.elements.sidebarOverlay?.classList.remove('active');
    }
    
    /**
     * Navigate to section
     * @param {string} section - Section name
     */
    async navigateToSection(section) {
        // Update active nav item
        this.elements.navItems?.forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        
        // Hide all sections
        const sections = [
            this.elements.dashboardSection,
            this.elements.usersSection,
            this.elements.chatSection,
            this.elements.archivedSection,
            this.elements.notificationsSection
        ];
        
        sections.forEach(el => {
            if (el) el.style.display = 'none';
        });
        
        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            users: 'User Management',
            chat: 'Chat Management',
            archived: 'Archived Messages',
            notifications: 'Notifications'
        };
        
        if (this.elements.pageTitle) {
            this.elements.pageTitle.textContent = titles[section] || 'Admin Panel';
        }
        
        // Show selected section and load data
        this.state.currentSection = section;
        
        switch (section) {
            case 'dashboard':
                if (this.elements.dashboardSection) {
                    this.elements.dashboardSection.style.display = 'block';
                }
                await this.loadDashboard();
                break;
                
            case 'users':
                if (this.elements.usersSection) {
                    this.elements.usersSection.style.display = 'block';
                }
                await this.loadUsers();
                break;
                
            case 'chat':
                if (this.elements.chatSection) {
                    this.elements.chatSection.style.display = 'block';
                }
                await this.loadChatManagement();
                break;
                
            case 'archived':
                if (this.elements.archivedSection) {
                    this.elements.archivedSection.style.display = 'block';
                }
                await this.loadArchivedMessages();
                break;
                
            case 'notifications':
                if (this.elements.notificationsSection) {
                    this.elements.notificationsSection.style.display = 'block';
                }
                await this.loadNotifications();
                break;
        }
        
        // Close sidebar on mobile
        this.closeSidebar();
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // User search
        if (this.elements.userSearchInput) {
            let searchTimeout;
            this.elements.userSearchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.state.filters.searchQuery = e.target.value.toLowerCase();
                    this.filterUsers();
                }, 300);
            });
        }
        
        // User status filter
        if (this.elements.userStatusFilter) {
            this.elements.userStatusFilter.addEventListener('change', (e) => {
                this.state.filters.userStatus = e.target.value;
                this.filterUsers();
            });
        }
        
        // User role filter
        if (this.elements.userRoleFilter) {
            this.elements.userRoleFilter.addEventListener('change', (e) => {
                this.state.filters.userRole = e.target.value;
                this.filterUsers();
            });
        }
        
        // Load more users
        if (this.elements.loadMoreUsersBtn) {
            this.elements.loadMoreUsersBtn.addEventListener('click', () => {
                this.loadMoreUsers();
            });
        }
        
        // Global search
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                // Global search implementation
            });
        }
        
        // Modal close buttons
        document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });
        
        // Modal overlay click to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeAllModals();
                }
            });
        });
    }
    
    // ============================================
    // DASHBOARD
    // ============================================
    
    /**
     * Load dashboard
     */
    async loadDashboard() {
        try {
            // Show loading
            this.showLoading('dashboard');
            
            // Load stats
            await this.loadDashboardStats();
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            showToast('Failed to load dashboard', 'error');
        }
    }
    
    /**
     * Load dashboard statistics
     */
    async loadDashboardStats() {
        try {
            // Get total users count
            const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
            const totalUsers = usersSnapshot.size;
            
            // Count by status
            let activeUsers = 0;
            let mutedUsers = 0;
            let bannedUsers = 0;
            const now = new Date();
            
            usersSnapshot.forEach(doc => {
                const data = doc.data();
                
                if (data.status === 'banned') {
                    bannedUsers++;
                } else if (data.mutedUntil) {
                    const muteEnd = data.mutedUntil.toDate ? 
                        data.mutedUntil.toDate() : new Date(data.mutedUntil);
                    if (muteEnd > now) {
                        mutedUsers++;
                    } else {
                        activeUsers++;
                    }
                } else {
                    activeUsers++;
                }
            });
            
            // Get messages count (today)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            
            const messagesQuery = query(
                collection(db, COLLECTIONS.MESSAGES),
                where('timestamp', '>=', Timestamp.fromDate(todayStart)),
                where('isArchived', '==', false)
            );
            const messagesSnapshot = await getDocs(messagesQuery);
            const todayMessages = messagesSnapshot.size;
            
            // Get archived messages count
            const archivedSnapshot = await getDocs(collection(db, 'archivedMessages'));
            const archivedCount = archivedSnapshot.size;
            
            // Update UI
            this.updateStatsUI({
                totalUsers,
                activeUsers,
                mutedUsers,
                bannedUsers,
                todayMessages,
                archivedCount
            });
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    /**
     * Update stats UI
     * @param {Object} stats - Statistics object
     */
    updateStatsUI(stats) {
        if (this.elements.totalUsersCard) {
            this.animateNumber(this.elements.totalUsersCard, stats.totalUsers);
        }
        
        if (this.elements.activeUsersCard) {
            this.animateNumber(this.elements.activeUsersCard, stats.activeUsers);
        }
        
        if (this.elements.mutedUsersCard) {
            this.animateNumber(this.elements.mutedUsersCard, stats.mutedUsers);
        }
        
        if (this.elements.bannedUsersCard) {
            this.animateNumber(this.elements.bannedUsersCard, stats.bannedUsers);
        }
        
        if (this.elements.totalMessagesCard) {
            this.animateNumber(this.elements.totalMessagesCard, stats.todayMessages);
        }
        
        if (this.elements.archivedMessagesCard) {
            this.animateNumber(this.elements.archivedMessagesCard, stats.archivedCount);
        }
    }
    
    /**
     * Animate number counting
     * @param {HTMLElement} element - Element to update
     * @param {number} target - Target number
     */
    animateNumber(element, target) {
        const start = parseInt(element.textContent) || 0;
        const duration = 500;
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(start + (target - start) * progress);
            element.textContent = current.toLocaleString();
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target.toLocaleString();
            }
        };
        
        requestAnimationFrame(update);
    }
    
    /**
     * Setup real-time stats updates
     */
    setupRealtimeStats() {
        // Refresh stats periodically
        setInterval(() => {
            if (this.state.currentSection === 'dashboard') {
                this.loadDashboardStats();
            }
        }, ADMIN_CONFIG.STATS_REFRESH_INTERVAL);
    }
    
    /**
     * Load recent activity
     */
    async loadRecentActivity() {
        const activityContainer = document.querySelector('#recentActivity');
        if (!activityContainer) return;
        
        try {
            // Get recent messages
            const messagesQuery = query(
                collection(db, COLLECTIONS.MESSAGES),
                orderBy('timestamp', 'desc'),
                limit(10)
            );
            
            const snapshot = await getDocs(messagesQuery);
            
            if (snapshot.empty) {
                activityContainer.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-state-icon">📭</span>
                        <p>No recent activity</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                html += `
                    <div class="activity-item">
                        <img src="${this.escapeHTML(msg.senderAvatar)}" 
                             alt="${this.escapeHTML(msg.senderName)}"
                             class="activity-avatar">
                        <div class="activity-content">
                            <span class="activity-user">${this.escapeHTML(msg.senderName)}</span>
                            <span class="activity-action">sent a message</span>
                            <span class="activity-time">${timeAgo(msg.timestamp)}</span>
                        </div>
                    </div>
                `;
            });
            
            activityContainer.innerHTML = html;
            
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }
    
    // ============================================
    // USER MANAGEMENT
    // ============================================
    
    /**
     * Load users
     */
    async loadUsers() {
        try {
            this.showLoading('users');
            
            // Reset pagination
            this.state.usersPagination = {
                lastDoc: null,
                hasMore: true
            };
            
            const usersQuery = query(
                collection(db, COLLECTIONS.USERS),
                orderBy('createdAt', 'desc'),
                limit(ADMIN_CONFIG.USERS_PER_PAGE)
            );
            
            const snapshot = await getDocs(usersQuery);
            
            this.state.users = [];
            snapshot.forEach(doc => {
                this.state.users.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Update pagination
            if (snapshot.docs.length > 0) {
                this.state.usersPagination.lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }
            this.state.usersPagination.hasMore = snapshot.docs.length === ADMIN_CONFIG.USERS_PER_PAGE;
            
            this.renderUsersTable();
            this.hideLoading('users');
            
        } catch (error) {
            console.error('Error loading users:', error);
            showToast('Failed to load users', 'error');
            this.hideLoading('users');
        }
    }
    
    /**
     * Load more users (pagination)
     */
    async loadMoreUsers() {
        if (!this.state.usersPagination.hasMore || !this.state.usersPagination.lastDoc) {
            return;
        }
        
        try {
            const btn = this.elements.loadMoreUsersBtn;
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Loading...';
            }
            
            const usersQuery = query(
                collection(db, COLLECTIONS.USERS),
                orderBy('createdAt', 'desc'),
                startAfter(this.state.usersPagination.lastDoc),
                limit(ADMIN_CONFIG.USERS_PER_PAGE)
            );
            
            const snapshot = await getDocs(usersQuery);
            
            snapshot.forEach(doc => {
                this.state.users.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Update pagination
            if (snapshot.docs.length > 0) {
                this.state.usersPagination.lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }
            this.state.usersPagination.hasMore = snapshot.docs.length === ADMIN_CONFIG.USERS_PER_PAGE;
            
            this.renderUsersTable();
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Load More';
                
                if (!this.state.usersPagination.hasMore) {
                    btn.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('Error loading more users:', error);
            showToast('Failed to load more users', 'error');
        }
    }
    
    /**
     * Filter users
     */
    filterUsers() {
        this.renderUsersTable();
    }
    
    /**
     * Get filtered users
     * @returns {Array}
     */
    getFilteredUsers() {
        let filtered = [...this.state.users];
        
        // Filter by status
        if (this.state.filters.userStatus !== 'all') {
            filtered = filtered.filter(user => {
                if (this.state.filters.userStatus === 'active') {
                    return user.status === 'active' && !this.isUserMuted(user);
                } else if (this.state.filters.userStatus === 'muted') {
                    return this.isUserMuted(user);
                } else if (this.state.filters.userStatus === 'banned') {
                    return user.status === 'banned';
                }
                return true;
            });
        }
        
        // Filter by role
        if (this.state.filters.userRole !== 'all') {
            filtered = filtered.filter(user => user.role === this.state.filters.userRole);
        }
        
        // Filter by search query
        if (this.state.filters.searchQuery) {
            const query = this.state.filters.searchQuery.toLowerCase();
            filtered = filtered.filter(user => 
                user.displayName?.toLowerCase().includes(query) ||
                user.username?.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query) ||
                user.mobile?.includes(query)
            );
        }
        
        return filtered;
    }
    
    /**
     * Check if user is currently muted
     * @param {Object} user - User data
     * @returns {boolean}
     */
    isUserMuted(user) {
        if (!user.mutedUntil) return false;
        
        const muteEnd = user.mutedUntil.toDate ? 
            user.mutedUntil.toDate() : new Date(user.mutedUntil);
        
        return muteEnd > new Date();
    }
    
    /**
     * Render users table
     */
    renderUsersTable() {
        if (!this.elements.usersTableBody) return;
        
        const filteredUsers = this.getFilteredUsers();
        
        if (filteredUsers.length === 0) {
            this.elements.usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center p-xl">
                        <div class="empty-state">
                            <span class="empty-state-icon">👤</span>
                            <p class="empty-state-title">No users found</p>
                            <p class="empty-state-text">Try adjusting your filters</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        
        filteredUsers.forEach(user => {
            const statusBadge = this.getUserStatusBadge(user);
            const roleBadge = this.getUserRoleBadge(user);
            
            html += `
                <tr data-user-id="${user.id}">
                    <td>
                        <div class="user-cell">
                            <img 
                                src="${this.escapeHTML(user.photoURL)}" 
                                alt="${this.escapeHTML(user.displayName)}"
                                class="user-cell-avatar ${user.gender || ''}"
                            >
                            <div class="user-cell-info">
                                <span class="user-cell-name">
                                    ${this.escapeHTML(user.displayName)}
                                    ${user.role === 'admin' ? '👑' : ''}
                                </span>
                                <span class="user-cell-username">@${this.escapeHTML(user.username)}</span>
                            </div>
                        </div>
                    </td>
                    <td>${this.escapeHTML(user.email)}</td>
                    <td>${this.escapeHTML(user.mobile || '-')}</td>
                    <td>${statusBadge}</td>
                    <td>${roleBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn view" title="View Profile" 
                                    onclick="adminManager.viewUser('${user.id}')">
                                👁️
                            </button>
                            ${user.role !== 'admin' ? `
                                <button class="action-btn mute" title="${this.isUserMuted(user) ? 'Unmute' : 'Mute'}"
                                        onclick="adminManager.${this.isUserMuted(user) ? 'unmute' : 'showMuteModal'}User('${user.id}')">
                                    ${this.isUserMuted(user) ? '🔊' : '🔇'}
                                </button>
                                <button class="action-btn ban" title="${user.status === 'banned' ? 'Unban' : 'Ban'}"
                                        onclick="adminManager.${user.status === 'banned' ? 'unban' : 'showBanModal'}User('${user.id}')">
                                    ${user.status === 'banned' ? '✅' : '⛔'}
                                </button>
                                <button class="action-btn delete" title="Delete User"
                                        onclick="adminManager.showDeleteUserConfirm('${user.id}')">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
        
        this.elements.usersTableBody.innerHTML = html;
        
        // Update load more button visibility
        if (this.elements.loadMoreUsersBtn) {
            this.elements.loadMoreUsersBtn.style.display = 
                this.state.usersPagination.hasMore ? 'block' : 'none';
        }
    }
    
    /**
     * Get user status badge HTML
     * @param {Object} user - User data
     * @returns {string}
     */
    getUserStatusBadge(user) {
        if (user.status === 'banned') {
            return '<span class="status-badge banned">⛔ Banned</span>';
        }
        
        if (this.isUserMuted(user)) {
            const muteEnd = user.mutedUntil.toDate ? 
                user.mutedUntil.toDate() : new Date(user.mutedUntil);
            const remaining = this.formatTimeRemaining(muteEnd);
            return `<span class="status-badge muted" title="Unmutes in ${remaining}">🔇 Muted</span>`;
        }
        
        return '<span class="status-badge active">✅ Active</span>';
    }
    
    /**
     * Get user role badge HTML
     * @param {Object} user - User data
     * @returns {string}
     */
    getUserRoleBadge(user) {
        if (user.role === 'admin') {
            return '<span class="role-badge admin">👑 Admin</span>';
        }
        return '<span class="role-badge user">👤 User</span>';
    }
    
    /**
     * Format time remaining
     * @param {Date} endTime - End time
     * @returns {string}
     */
    formatTimeRemaining(endTime) {
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) return 'now';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
    
    // ============================================
    // USER ACTIONS
    // ============================================
    
    /**
     * View user details
     * @param {string} userId - User ID
     */
    async viewUser(userId) {
        try {
            // Get user data
            const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, userId));
            
            if (!userDoc.exists()) {
                showToast('User not found', 'error');
                return;
            }
            
            const user = {
                id: userDoc.id,
                ...userDoc.data()
            };
            
            this.state.selectedUser = user;
            
            // Show modal
            this.showUserDetailModal(user);
            
        } catch (error) {
            console.error('Error loading user:', error);
            showToast('Failed to load user details', 'error');
        }
    }
    
    /**
     * Show user detail modal
     * @param {Object} user - User data
     */
    showUserDetailModal(user) {
        let modal = this.elements.userDetailModal;
        
        if (!modal) {
            modal = this.createModal('userDetailModal', 'User Details', 'modal-lg');
            this.elements.userDetailModal = modal;
        }
        
        const genderClass = user.gender || '';
        const statusBadge = this.getUserStatusBadge(user);
        const roleBadge = this.getUserRoleBadge(user);
        
        const createdAt = user.createdAt ? formatTimestamp(user.createdAt) : 'Unknown';
        const lastActive = user.lastActive ? timeAgo(user.lastActive) : 'Unknown';
        
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="user-detail-header">
                <img 
                    src="${this.escapeHTML(user.photoURL)}" 
                    alt="${this.escapeHTML(user.displayName)}"
                    class="user-detail-avatar ${genderClass}"
                >
                <div class="user-detail-info">
                    <h3>${this.escapeHTML(user.displayName)} ${roleBadge}</h3>
                    <p class="user-detail-username">@${this.escapeHTML(user.username)}</p>
                    ${statusBadge}
                </div>
            </div>
            
            <div class="user-detail-grid">
                <div class="user-detail-item">
                    <span class="user-detail-label">Email</span>
                    <span class="user-detail-value">${this.escapeHTML(user.email)}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Mobile</span>
                    <span class="user-detail-value">${this.escapeHTML(user.mobile || 'Not provided')}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Gender</span>
                    <span class="user-detail-value">${this.capitalizeFirst(user.gender || 'Not specified')}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Role</span>
                    <span class="user-detail-value">${this.capitalizeFirst(user.role)}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Member Since</span>
                    <span class="user-detail-value">${createdAt}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Last Active</span>
                    <span class="user-detail-value">${lastActive}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Total Messages</span>
                    <span class="user-detail-value">${user.totalMessages || 0}</span>
                </div>
                <div class="user-detail-item">
                    <span class="user-detail-label">Warnings</span>
                    <span class="user-detail-value ${user.warningCount > 0 ? 'text-error' : ''}">
                        ${user.warningCount || 0}
                    </span>
                </div>
            </div>
            
            ${user.status === 'banned' ? `
                <div class="alert alert-error mt-lg">
                    <span class="alert-icon">⛔</span>
                    <div class="alert-content">
                        <strong>Ban Reason:</strong>
                        <p class="m-0">${this.escapeHTML(user.banReason || 'No reason provided')}</p>
                    </div>
                </div>
            ` : ''}
            
            ${this.isUserMuted(user) ? `
                <div class="alert alert-warning mt-lg">
                    <span class="alert-icon">🔇</span>
                    <div class="alert-content">
                        <strong>Muted Until:</strong>
                        <p class="m-0">${formatTimestamp(user.mutedUntil)}</p>
                    </div>
                </div>
            ` : ''}
        `;
        
        // Show modal
        modal.classList.add('active');
    }
    
    /**
     * Show mute user modal
     * @param {string} userId - User ID
     */
    showMuteModal(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;
        
        this.state.selectedUser = user;
        
        let modal = this.elements.muteModal;
        
        if (!modal) {
            modal = this.createModal('muteModal', 'Mute User');
            this.elements.muteModal = modal;
        }
        
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <p>Select mute duration for <strong>@${this.escapeHTML(user.username)}</strong>:</p>
            
            <div class="form-group mt-lg">
                <div class="radio-group">
                    <label class="neu-radio-wrapper">
                        <input type="radio" name="muteDuration" value="1hour" checked>
                        <span class="neu-radio"></span>
                        <span class="neu-radio-label">1 Hour</span>
                    </label>
                    <label class="neu-radio-wrapper">
                        <input type="radio" name="muteDuration" value="24hours">
                        <span class="neu-radio"></span>
                        <span class="neu-radio-label">24 Hours</span>
                    </label>
                    <label class="neu-radio-wrapper">
                        <input type="radio" name="muteDuration" value="48hours">
                        <span class="neu-radio"></span>
                        <span class="neu-radio-label">48 Hours</span>
                    </label>
                    <label class="neu-radio-wrapper">
                        <input type="radio" name="muteDuration" value="7days">
                        <span class="neu-radio"></span>
                        <span class="neu-radio-label">7 Days</span>
                    </label>
                    <label class="neu-radio-wrapper">
                        <input type="radio" name="muteDuration" value="custom">
                        <span class="neu-radio"></span>
                        <span class="neu-radio-label">Custom</span>
                    </label>
                </div>
            </div>
            
            <div class="form-group custom-duration-group" style="display: none;">
                <label class="form-label">Custom Duration (hours)</label>
                <input type="number" class="neu-input" id="customMuteDuration" 
                       min="1" max="720" value="24">
            </div>
        `;
        
        // Setup custom duration toggle
        const radios = modalBody.querySelectorAll('input[name="muteDuration"]');
        const customGroup = modalBody.querySelector('.custom-duration-group');
        
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                customGroup.style.display = radio.value === 'custom' ? 'block' : 'none';
            });
        });
        
        // Update footer
        const modalFooter = modal.querySelector('.modal-footer');
        modalFooter.innerHTML = `
            <button class="neu-button" onclick="adminManager.closeAllModals()">Cancel</button>
            <button class="neu-button neu-button-warning" onclick="adminManager.muteUser('${userId}')">
                🔇 Mute User
            </button>
        `;
        
        modal.classList.add('active');
    }
    
    /**
     * Mute user
     * @param {string} userId - User ID
     */
    async muteUser(userId) {
        try {
            const modal = this.elements.muteModal;
            const selectedDuration = modal.querySelector('input[name="muteDuration"]:checked')?.value;
            
            let durationMs;
            
            if (selectedDuration === 'custom') {
                const customHours = parseInt(modal.querySelector('#customMuteDuration')?.value) || 24;
                durationMs = customHours * 60 * 60 * 1000;
            } else {
                durationMs = ADMIN_CONFIG.MUTE_DURATIONS[selectedDuration] || ADMIN_CONFIG.MUTE_DURATIONS['24hours'];
            }
            
            const mutedUntil = new Date(Date.now() + durationMs);
            
            await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
                mutedUntil: Timestamp.fromDate(mutedUntil),
                status: 'active' // Keep status active, mute is separate
            });
            
            // Log admin action
            await this.logAdminAction('mute', userId, {
                duration: selectedDuration,
                mutedUntil: mutedUntil.toISOString()
            });
            
            // Update local state
            const userIndex = this.state.users.findIndex(u => u.id === userId);
            if (userIndex >= 0) {
                this.state.users[userIndex].mutedUntil = Timestamp.fromDate(mutedUntil);
            }
            
            this.closeAllModals();
            this.renderUsersTable();
            showToast('User muted successfully', 'success');
            
        } catch (error) {
            console.error('Error muting user:', error);
            showToast('Failed to mute user', 'error');
        }
    }
    
    /**
     * Unmute user
     * @param {string} userId - User ID
     */
    async unmuteUser(userId) {
        try {
            await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
                mutedUntil: null
            });
            
            await this.logAdminAction('unmute', userId);
            
            // Update local state
            const userIndex = this.state.users.findIndex(u => u.id === userId);
            if (userIndex >= 0) {
                this.state.users[userIndex].mutedUntil = null;
            }
            
            this.renderUsersTable();
            showToast('User unmuted successfully', 'success');
            
        } catch (error) {
            console.error('Error unmuting user:', error);
            showToast('Failed to unmute user', 'error');
        }
    }
    
    /**
     * Show ban user modal
     * @param {string} userId - User ID
     */
    showBanModal(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;
        
        this.state.selectedUser = user;
        
        let modal = this.elements.banModal;
        
        if (!modal) {
            modal = this.createModal('banModal', 'Ban User');
            this.elements.banModal = modal;
        }
        
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="alert alert-error mb-lg">
                <span class="alert-icon">⚠️</span>
                <span class="alert-content">
                    This action will permanently ban the user from the chat.
                </span>
            </div>
            
            <p>Are you sure you want to ban <strong>@${this.escapeHTML(user.username)}</strong>?</p>
            
            <div class="form-group mt-lg">
                <label class="form-label required">Ban Reason</label>
                <textarea class="neu-input neu-textarea" id="banReason" rows="3"
                          placeholder="Enter the reason for banning this user..."
                          required></textarea>
            </div>
        `;
        
        const modalFooter = modal.querySelector('.modal-footer');
        modalFooter.innerHTML = `
            <button class="neu-button" onclick="adminManager.closeAllModals()">Cancel</button>
            <button class="neu-button neu-button-danger" onclick="adminManager.banUser('${userId}')">
                ⛔ Ban User
            </button>
        `;
        
        modal.classList.add('active');
    }
    
    /**
     * Ban user
     * @param {string} userId - User ID
     */
    async banUser(userId) {
        try {
            const modal = this.elements.banModal;
            const banReason = modal.querySelector('#banReason')?.value?.trim();
            
            if (!banReason) {
                showToast('Please provide a ban reason', 'error');
                return;
            }
            
            await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
                status: 'banned',
                banReason: banReason,
                bannedAt: serverTimestamp(),
                mutedUntil: null
            });
            
            await this.logAdminAction('ban', userId, { reason: banReason });
            
            // Update local state
            const userIndex = this.state.users.findIndex(u => u.id === userId);
            if (userIndex >= 0) {
                this.state.users[userIndex].status = 'banned';
                this.state.users[userIndex].banReason = banReason;
            }
            
            this.closeAllModals();
            this.renderUsersTable();
            showToast('User banned successfully', 'success');
            
        } catch (error) {
            console.error('Error banning user:', error);
            showToast('Failed to ban user', 'error');
        }
    }
    
    /**
     * Unban user
     * @param {string} userId - User ID
     */
    async unbanUser(userId) {
        try {
            await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
                status: 'active',
                banReason: null,
                bannedAt: null,
                warningCount: 0 // Reset warnings on unban
            });
            
            await this.logAdminAction('unban', userId);
            
            // Update local state
            const userIndex = this.state.users.findIndex(u => u.id === userId);
            if (userIndex >= 0) {
                this.state.users[userIndex].status = 'active';
                this.state.users[userIndex].banReason = null;
            }
            
            this.renderUsersTable();
            showToast('User unbanned successfully', 'success');
            
        } catch (error) {
            console.error('Error unbanning user:', error);
            showToast('Failed to unban user', 'error');
        }
    }
    
    /**
     * Show delete user confirmation
     * @param {string} userId - User ID
     */
    showDeleteUserConfirm(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;
        
        this.showConfirmModal({
            title: 'Delete User',
            message: `Are you sure you want to permanently delete <strong>@${this.escapeHTML(user.username)}</strong>? This action cannot be undone.`,
            icon: '🗑️',
            iconClass: 'danger',
            confirmText: 'Delete User',
            confirmClass: 'neu-button-danger',
            onConfirm: () => this.deleteUser(userId)
        });
    }
    
    /**
     * Delete user
     * @param {string} userId - User ID
     */
    async deleteUser(userId) {
        try {
            // Delete user document
            await deleteDoc(doc(db, COLLECTIONS.USERS, userId));
            
            // Note: In production, you'd also want to:
            // 1. Delete from Firebase Auth (requires Admin SDK)
            // 2. Delete user's messages or mark them
            // 3. Delete user's uploaded files
            
            await this.logAdminAction('delete', userId);
            
            // Remove from local state
            this.state.users = this.state.users.filter(u => u.id !== userId);
            
            this.closeAllModals();
            this.renderUsersTable();
            showToast('User deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting user:', error);
            showToast('Failed to delete user', 'error');
        }
    }
    
    // ============================================
    // UTILITY METHODS
    // ============================================
    
    /**
     * Create modal element
     * @param {string} id - Modal ID
     * @param {string} title - Modal title
     * @param {string} sizeClass - Size class
     * @returns {HTMLElement}
     */
    createModal(id, title, sizeClass = '') {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = id;
        modal.innerHTML = `
            <div class="modal ${sizeClass}">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body"></div>
                <div class="modal-footer"></div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            this.closeAllModals();
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeAllModals();
            }
        });
        
        return modal;
    }
    
    /**
     * Show confirmation modal
     * @param {Object} options - Modal options
     */
    showConfirmModal(options) {
        let modal = this.elements.confirmModal;
        
        if (!modal) {
            modal = this.createModal('confirmModal', 'Confirm');
            this.elements.confirmModal = modal;
        }
        
        const modalHeader = modal.querySelector('.modal-title');
        modalHeader.textContent = options.title || 'Confirm';
        
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="confirm-modal-icon ${options.iconClass || ''}">
                ${options.icon || '⚠️'}
            </div>
            <h4 class="confirm-modal-title">${options.title || 'Confirm'}</h4>
            <p class="confirm-modal-text">${options.message || 'Are you sure?'}</p>
        `;
        
        const modalFooter = modal.querySelector('.modal-footer');
        modalFooter.innerHTML = `
            <button class="neu-button" onclick="adminManager.closeAllModals()">
                ${options.cancelText || 'Cancel'}
            </button>
            <button class="neu-button ${options.confirmClass || 'neu-button-primary'}" id="confirmBtn">
                ${options.confirmText || 'Confirm'}
            </button>
        `;
        
        // Setup confirm button
        modalFooter.querySelector('#confirmBtn').addEventListener('click', () => {
            if (options.onConfirm) {
                options.onConfirm();
            }
            this.closeAllModals();
        });
        
        modal.classList.add('active');
    }
    
    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('active');
        });
        
        this.state.selectedUser = null;
        this.state.selectedMessage = null;
    }
    
    /**
     * Show loading state
     * @param {string} section - Section name
     */
    showLoading(section) {
        // Implementation depends on UI structure
    }
    
    /**
     * Hide loading state
     * @param {string} section - Section name
     */
    hideLoading(section) {
        // Implementation depends on UI structure
    }
    
    /**
     * Log admin action
     * @param {string} action - Action type
     * @param {string} targetId - Target user/message ID
     * @param {Object} details - Additional details
     */
    async logAdminAction(action, targetId, details = {}) {
        try {
            const admin = getCurrentUser();
            
            await addDoc(collection(db, 'adminLogs'), {
                adminId: admin.uid,
                adminEmail: admin.email,
                action: action,
                targetId: targetId,
                details: details,
                timestamp: serverTimestamp()
            });
            
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
    }
    
    /**
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string}
     */
    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Capitalize first letter
     * @param {string} text - Text to capitalize
     * @returns {string}
     */
    capitalizeFirst(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================
const adminManager = new AdminManager();

// ============================================
// EXPORTS FOR PART 1
// ============================================
export {
    AdminManager,
    adminManager,
    ADMIN_CONFIG,
    adminState,
    adminElements
};

// Make available globally
if (typeof window !== 'undefined') {
    window.adminManager = adminManager;
}

console.log('👑 Admin System (Part 1) - Dashboard & User Management loaded');

/**
 * ============================================
 * STUDY HUB - Admin Panel System
 * ============================================
 * Part 2: Chat Management, Archived Messages, Notifications
 * 
 * Features:
 * - Chat message management
 * - Pin/Unpin messages
 * - Admin replies
 * - Archive management
 * - Notification CRUD
 * - Google Sheets integration
 * ============================================
 */

import {
    db,
    storage,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    writeBatch,
    COLLECTIONS,
    formatTimestamp,
    timeAgo
} from './firebase-config.js';

import {
    getCurrentUser,
    getCurrentUserData,
    showToast
} from './auth.js';

import {
    adminManager,
    ADMIN_CONFIG,
    adminState,
    adminElements
} from './admin.js';

// ============================================
// CHAT MANAGEMENT
// ============================================

/**
 * Load chat management section
 */
adminManager.loadChatManagement = async function() {
    try {
        this.showLoading('chat');
        
        // Setup real-time message listener
        this.setupMessagesListener();
        
    } catch (error) {
        console.error('Error loading chat management:', error);
        showToast('Failed to load chat management', 'error');
    }
};

/**
 * Setup real-time messages listener for admin
 */
adminManager.setupMessagesListener = function() {
    // Unsubscribe existing listener
    if (this.state.messagesUnsubscribe) {
        this.state.messagesUnsubscribe();
    }
    
    const messagesQuery = query(
        collection(db, COLLECTIONS.MESSAGES),
        where('isArchived', '==', false),
        orderBy('timestamp', 'desc'),
        limit(ADMIN_CONFIG.MESSAGES_PER_PAGE)
    );
    
    this.state.messagesUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        this.state.messages = [];
        
        snapshot.forEach(doc => {
            this.state.messages.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        this.renderChatMessages();
        this.hideLoading('chat');
    }, (error) => {
        console.error('Messages listener error:', error);
        showToast('Failed to load messages', 'error');
    });
};

/**
 * Render chat messages in admin panel
 */
adminManager.renderChatMessages = function() {
    const messagesContainer = document.querySelector('#adminMessagesContainer');
    if (!messagesContainer) return;
    
    if (this.state.messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">💬</span>
                <p class="empty-state-title">No messages yet</p>
                <p class="empty-state-text">Messages will appear here in real-time</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    this.state.messages.forEach(message => {
        const isSelected = this.state.selectedMessage?.id === message.id;
        const isPinned = message.isPinned;
        
        html += `
            <div class="admin-message-item ${isSelected ? 'selected' : ''} ${isPinned ? 'pinned' : ''}"
                 data-message-id="${message.id}"
                 onclick="adminManager.selectMessage('${message.id}')">
                <img 
                    src="${this.escapeHTML(message.senderAvatar)}" 
                    alt="${this.escapeHTML(message.senderName)}"
                    class="admin-message-avatar"
                >
                <div class="admin-message-content">
                    <div class="admin-message-header">
                        <span class="admin-message-username">
                            ${this.escapeHTML(message.senderName)}
                            ${isPinned ? '📌' : ''}
                        </span>
                        <span class="admin-message-time">${timeAgo(message.timestamp)}</span>
                    </div>
                    <div class="admin-message-text">
                        ${message.imageURL ? '📷 ' : ''}
                        ${this.escapeHTML(this.truncateText(message.content, 100))}
                        ${message.imageURL ? `
                            <img src="${this.escapeHTML(message.imageURL)}" 
                                 alt="Image" class="admin-message-thumb">
                        ` : ''}
                    </div>
                </div>
                <div class="admin-message-actions">
                    <button class="action-btn ${isPinned ? 'success' : ''}" 
                            title="${isPinned ? 'Unpin' : 'Pin'}"
                            onclick="event.stopPropagation(); adminManager.togglePin('${message.id}')">
                        📌
                    </button>
                    <button class="action-btn" title="Reply"
                            onclick="event.stopPropagation(); adminManager.showReplyInput('${message.id}')">
                        ↩️
                    </button>
                    <button class="action-btn delete" title="Delete"
                            onclick="event.stopPropagation(); adminManager.showDeleteMessageModal('${message.id}')">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    messagesContainer.innerHTML = html;
};

/**
 * Select a message for actions
 * @param {string} messageId - Message ID
 */
adminManager.selectMessage = function(messageId) {
    const message = this.state.messages.find(m => m.id === messageId);
    
    if (!message) return;
    
    this.state.selectedMessage = message;
    
    // Update UI
    this.renderChatMessages();
    this.showMessageActions(message);
};

/**
 * Show message actions panel
 * @param {Object} message - Selected message
 */
adminManager.showMessageActions = function(message) {
    const actionsPanel = document.querySelector('#messageActionsPanel');
    if (!actionsPanel) return;
    
    actionsPanel.innerHTML = `
        <div class="message-actions-header">
            <h4 class="message-actions-title">Message Actions</h4>
        </div>
        <div class="message-actions-body">
            <div class="selected-message-preview">
                <div class="message-username">
                    ${this.escapeHTML(message.senderName)} (@${this.escapeHTML(message.senderUsername)})
                </div>
                <div class="message-text">
                    ${message.imageURL ? '<img src="' + this.escapeHTML(message.imageURL) + '" alt="Image" style="max-width:100%;border-radius:8px;margin-bottom:8px;">' : ''}
                    ${this.escapeHTML(message.content)}
                </div>
                <div class="message-meta mt-sm text-muted fs-sm">
                    ${formatTimestamp(message.timestamp)}
                </div>
            </div>
            
            <div class="action-buttons-grid mt-lg">
                <button class="neu-button neu-button-sm ${message.isPinned ? 'neu-button-success' : ''}"
                        onclick="adminManager.togglePin('${message.id}')">
                    📌 ${message.isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button class="neu-button neu-button-sm"
                        onclick="adminManager.showReplyInput('${message.id}')">
                    ↩️ Reply
                </button>
                <button class="neu-button neu-button-sm neu-button-warning"
                        onclick="adminManager.showDeleteMessageModal('${message.id}')">
                    🗑️ Archive
                </button>
                <button class="neu-button neu-button-sm"
                        onclick="adminManager.viewUserFromMessage('${message.senderId}')">
                    👤 View User
                </button>
            </div>
            
            <div class="admin-reply-section mt-lg" id="adminReplySection" style="display:none;">
                <label class="form-label">Admin Reply</label>
                <textarea class="neu-input neu-textarea" id="adminReplyText" rows="3"
                          placeholder="Type your reply..."></textarea>
                <div class="d-flex gap-sm mt-md justify-end">
                    <button class="neu-button neu-button-sm" onclick="adminManager.hideReplyInput()">
                        Cancel
                    </button>
                    <button class="neu-button neu-button-sm neu-button-primary"
                            onclick="adminManager.sendAdminReply('${message.id}')">
                        Send Reply
                    </button>
                </div>
            </div>
        </div>
    `;
};

/**
 * Toggle pin status of a message
 * @param {string} messageId - Message ID
 */
adminManager.togglePin = async function(messageId) {
    try {
        const message = this.state.messages.find(m => m.id === messageId);
        if (!message) return;
        
        const newPinStatus = !message.isPinned;
        
        // Check max pinned messages
        if (newPinStatus) {
            const pinnedCount = this.state.messages.filter(m => m.isPinned).length;
            if (pinnedCount >= ADMIN_CONFIG.MAX_PINNED_MESSAGES) {
                showToast(`Maximum ${ADMIN_CONFIG.MAX_PINNED_MESSAGES} pinned messages allowed`, 'warning');
                return;
            }
        }
        
        await updateDoc(doc(db, COLLECTIONS.MESSAGES, messageId), {
            isPinned: newPinStatus,
            pinnedAt: newPinStatus ? serverTimestamp() : null,
            pinnedBy: newPinStatus ? getCurrentUser()?.uid : null
        });
        
        showToast(newPinStatus ? 'Message pinned' : 'Message unpinned', 'success');
        
        // Log action
        await this.logAdminAction(newPinStatus ? 'pin' : 'unpin', messageId);
        
    } catch (error) {
        console.error('Error toggling pin:', error);
        showToast('Failed to update pin status', 'error');
    }
};

/**
 * Show reply input
 * @param {string} messageId - Message ID
 */
adminManager.showReplyInput = function(messageId) {
    const message = this.state.messages.find(m => m.id === messageId);
    if (!message) return;
    
    this.state.selectedMessage = message;
    
    const replySection = document.querySelector('#adminReplySection');
    if (replySection) {
        replySection.style.display = 'block';
        document.querySelector('#adminReplyText')?.focus();
    }
};

/**
 * Hide reply input
 */
adminManager.hideReplyInput = function() {
    const replySection = document.querySelector('#adminReplySection');
    if (replySection) {
        replySection.style.display = 'none';
    }
    
    const replyText = document.querySelector('#adminReplyText');
    if (replyText) {
        replyText.value = '';
    }
};

/**
 * Send admin reply
 * @param {string} originalMessageId - Original message ID
 */
adminManager.sendAdminReply = async function(originalMessageId) {
    const replyText = document.querySelector('#adminReplyText')?.value?.trim();
    
    if (!replyText) {
        showToast('Please enter a reply', 'error');
        return;
    }
    
    try {
        const admin = getCurrentUser();
        const adminData = getCurrentUserData();
        const originalMessage = this.state.messages.find(m => m.id === originalMessageId);
        
        if (!originalMessage) {
            showToast('Original message not found', 'error');
            return;
        }
        
        // Create admin reply message
        const replyData = {
            senderId: admin.uid,
            senderName: adminData.displayName,
            senderUsername: adminData.username,
            senderAvatar: adminData.photoURL,
            senderGender: adminData.gender,
            senderRole: 'admin',
            content: replyText,
            type: 'text',
            imageURL: null,
            isPinned: false,
            isAdminReply: true,
            replyToMessageId: originalMessageId,
            replyToContent: this.truncateText(originalMessage.content, 100),
            replyToUsername: originalMessage.senderUsername,
            isArchived: false,
            timestamp: serverTimestamp()
        };
        
        await addDoc(collection(db, COLLECTIONS.MESSAGES), replyData);
        
        this.hideReplyInput();
        showToast('Reply sent successfully', 'success');
        
        // Log action
        await this.logAdminAction('reply', originalMessageId, { replyContent: replyText });
        
    } catch (error) {
        console.error('Error sending reply:', error);
        showToast('Failed to send reply', 'error');
    }
};

/**
 * Show delete message modal
 * @param {string} messageId - Message ID
 */
adminManager.showDeleteMessageModal = function(messageId) {
    const message = this.state.messages.find(m => m.id === messageId);
    if (!message) return;
    
    let modal = document.querySelector('#deleteMessageModal');
    
    if (!modal) {
        modal = this.createModal('deleteMessageModal', 'Archive Message');
    }
    
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
        <div class="selected-message-preview mb-lg">
            <div class="message-username">
                ${this.escapeHTML(message.senderName)}
            </div>
            <div class="message-text">
                ${this.escapeHTML(this.truncateText(message.content, 200))}
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label required">Reason for archiving</label>
            <select class="neu-input neu-select" id="archiveReason">
                <option value="">Select a reason</option>
                ${Object.entries(ADMIN_CONFIG.ARCHIVE_REASONS).map(([key, label]) => 
                    `<option value="${key}">${label}</option>`
                ).join('')}
            </select>
        </div>
        
        <div class="form-group">
            <label class="form-label">Additional notes (optional)</label>
            <textarea class="neu-input neu-textarea" id="archiveNotes" rows="2"
                      placeholder="Add any additional notes..."></textarea>
        </div>
        
        <div class="neu-checkbox-wrapper mt-md">
            <input type="checkbox" id="warnUser">
            <span class="neu-checkbox"></span>
            <span class="neu-checkbox-label">Add warning to user's account</span>
        </div>
    `;
    
    const modalFooter = modal.querySelector('.modal-footer');
    modalFooter.innerHTML = `
        <button class="neu-button" onclick="adminManager.closeAllModals()">Cancel</button>
        <button class="neu-button neu-button-warning" onclick="adminManager.archiveMessage('${messageId}')">
            🗑️ Archive Message
        </button>
    `;
    
    modal.classList.add('active');
};

/**
 * Archive (soft delete) a message
 * @param {string} messageId - Message ID
 */
adminManager.archiveMessage = async function(messageId) {
    const reason = document.querySelector('#archiveReason')?.value;
    const notes = document.querySelector('#archiveNotes')?.value?.trim();
    const warnUser = document.querySelector('#warnUser')?.checked;
    
    if (!reason) {
        showToast('Please select a reason', 'error');
        return;
    }
    
    try {
        const message = this.state.messages.find(m => m.id === messageId);
        if (!message) return;
        
        // Create archived message record
        await addDoc(collection(db, 'archivedMessages'), {
            originalId: messageId,
            senderId: message.senderId,
            senderName: message.senderName,
            senderUsername: message.senderUsername,
            content: message.content,
            imageURL: message.imageURL,
            reason: reason,
            reasonLabel: ADMIN_CONFIG.ARCHIVE_REASONS[reason],
            notes: notes || null,
            originalTimestamp: message.timestamp,
            archivedAt: serverTimestamp(),
            archivedBy: getCurrentUser()?.uid
        });
        
        // Mark original message as archived
        await updateDoc(doc(db, COLLECTIONS.MESSAGES, messageId), {
            isArchived: true,
            archivedAt: serverTimestamp(),
            archivedReason: reason
        });
        
        // Warn user if checked
        if (warnUser) {
            await updateDoc(doc(db, COLLECTIONS.USERS, message.senderId), {
                warningCount: increment(1),
                lastWarning: serverTimestamp()
            });
        }
        
        this.closeAllModals();
        showToast('Message archived successfully', 'success');
        
        // Log action
        await this.logAdminAction('archive', messageId, { 
            reason, 
            notes,
            userWarned: warnUser 
        });
        
    } catch (error) {
        console.error('Error archiving message:', error);
        showToast('Failed to archive message', 'error');
    }
};

/**
 * View user from message
 * @param {string} userId - User ID
 */
adminManager.viewUserFromMessage = function(userId) {
    this.viewUser(userId);
};

// ============================================
// ARCHIVED MESSAGES
// ============================================

/**
 * Load archived messages
 */
adminManager.loadArchivedMessages = async function() {
    try {
        this.showLoading('archived');
        
        const archivedQuery = query(
            collection(db, 'archivedMessages'),
            orderBy('archivedAt', 'desc'),
            limit(ADMIN_CONFIG.ARCHIVED_PER_PAGE)
        );
        
        const snapshot = await getDocs(archivedQuery);
        
        this.state.archivedMessages = [];
        snapshot.forEach(doc => {
            this.state.archivedMessages.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        this.renderArchivedMessages();
        this.hideLoading('archived');
        
    } catch (error) {
        console.error('Error loading archived messages:', error);
        showToast('Failed to load archived messages', 'error');
    }
};

/**
 * Render archived messages
 */
adminManager.renderArchivedMessages = function() {
    const container = document.querySelector('#archivedMessagesContainer');
    if (!container) return;
    
    // Render filters
    const filtersHtml = `
        <div class="archived-filters mb-lg">
            <div class="filter-group">
                <label class="filter-label">Reason:</label>
                <select class="filter-select" id="archivedReasonFilter"
                        onchange="adminManager.filterArchived()">
                    <option value="all">All Reasons</option>
                    ${Object.entries(ADMIN_CONFIG.ARCHIVE_REASONS).map(([key, label]) => 
                        `<option value="${key}">${label}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">Date:</label>
                <select class="filter-select" id="archivedDateFilter"
                        onchange="adminManager.filterArchived()">
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                </select>
            </div>
        </div>
    `;
    
    if (this.state.archivedMessages.length === 0) {
        container.innerHTML = filtersHtml + `
            <div class="empty-state">
                <span class="empty-state-icon">📁</span>
                <p class="empty-state-title">No archived messages</p>
                <p class="empty-state-text">Archived messages will appear here</p>
            </div>
        `;
        return;
    }
    
    let messagesHtml = '';
    
    this.state.archivedMessages.forEach(message => {
        const reasonClass = message.reason || 'other';
        
        messagesHtml += `
            <div class="archived-message-item ${reasonClass}">
                <div class="archived-message-content">
                    <div class="archived-message-meta">
                        <span class="archived-message-reason ${reasonClass}">
                            ${message.reasonLabel || 'Unknown'}
                        </span>
                        <span class="text-muted">by @${this.escapeHTML(message.senderUsername)}</span>
                        <span class="text-muted">${timeAgo(message.archivedAt)}</span>
                    </div>
                    <div class="archived-message-text">
                        ${message.imageURL ? '<span class="text-muted">[Image] </span>' : ''}
                        ${this.escapeHTML(message.content || 'No text content')}
                    </div>
                    ${message.notes ? `
                        <div class="archived-message-notes mt-sm">
                            <small class="text-muted">📝 ${this.escapeHTML(message.notes)}</small>
                        </div>
                    ` : ''}
                    <div class="archived-message-actions mt-md">
                        <button class="neu-button neu-button-sm neu-button-success"
                                onclick="adminManager.restoreMessage('${message.id}', '${message.originalId}')">
                            ↩️ Restore
                        </button>
                        <button class="neu-button neu-button-sm neu-button-danger"
                                onclick="adminManager.permanentDeleteMessage('${message.id}')">
                            ❌ Delete Permanently
                        </button>
                        <button class="neu-button neu-button-sm"
                                onclick="adminManager.viewUser('${message.senderId}')">
                            👤 View User
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = filtersHtml + messagesHtml;
};

/**
 * Filter archived messages
 */
adminManager.filterArchived = function() {
    const reasonFilter = document.querySelector('#archivedReasonFilter')?.value;
    const dateFilter = document.querySelector('#archivedDateFilter')?.value;
    
    // Apply filters and re-render
    // For now, simple client-side filtering
    // In production, you'd want to re-query Firestore
    
    let filtered = [...this.state.archivedMessages];
    
    if (reasonFilter && reasonFilter !== 'all') {
        filtered = filtered.filter(m => m.reason === reasonFilter);
    }
    
    if (dateFilter && dateFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(m => {
            const archivedDate = m.archivedAt?.toDate ? 
                m.archivedAt.toDate() : new Date(m.archivedAt);
            
            switch (dateFilter) {
                case 'today':
                    return archivedDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    return archivedDate >= weekAgo;
                case 'month':
                    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    return archivedDate >= monthAgo;
                default:
                    return true;
            }
        });
    }
    
    // Re-render with filtered data
    const container = document.querySelector('#archivedMessagesContainer');
    if (!container) return;
    
    const filtersSection = container.querySelector('.archived-filters');
    
    if (filtered.length === 0) {
        container.innerHTML = '';
        if (filtersSection) container.appendChild(filtersSection.cloneNode(true));
        container.innerHTML += `
            <div class="empty-state">
                <span class="empty-state-icon">🔍</span>
                <p class="empty-state-title">No matches found</p>
                <p class="empty-state-text">Try adjusting your filters</p>
            </div>
        `;
        return;
    }
    
    // Rebuild with filtered messages
    const tempState = this.state.archivedMessages;
    this.state.archivedMessages = filtered;
    this.renderArchivedMessages();
    this.state.archivedMessages = tempState;
};

/**
 * Restore archived message
 * @param {string} archivedId - Archived document ID
 * @param {string} originalId - Original message ID
 */
adminManager.restoreMessage = async function(archivedId, originalId) {
    try {
        // Restore original message
        await updateDoc(doc(db, COLLECTIONS.MESSAGES, originalId), {
            isArchived: false,
            archivedAt: null,
            archivedReason: null
        });
        
        // Delete from archived collection
        await deleteDoc(doc(db, 'archivedMessages', archivedId));
        
        // Remove from local state
        this.state.archivedMessages = this.state.archivedMessages.filter(
            m => m.id !== archivedId
        );
        
        this.renderArchivedMessages();
        showToast('Message restored successfully', 'success');
        
        await this.logAdminAction('restore', originalId);
        
    } catch (error) {
        console.error('Error restoring message:', error);
        showToast('Failed to restore message', 'error');
    }
};

/**
 * Permanently delete message
 * @param {string} archivedId - Archived document ID
 */
adminManager.permanentDeleteMessage = async function(archivedId) {
    this.showConfirmModal({
        title: 'Permanent Delete',
        message: 'This action cannot be undone. The message will be permanently deleted.',
        icon: '⚠️',
        iconClass: 'danger',
        confirmText: 'Delete Permanently',
        confirmClass: 'neu-button-danger',
        onConfirm: async () => {
            try {
                // Delete from archived collection
                await deleteDoc(doc(db, 'archivedMessages', archivedId));
                
                // Remove from local state
                this.state.archivedMessages = this.state.archivedMessages.filter(
                    m => m.id !== archivedId
                );
                
                this.renderArchivedMessages();
                showToast('Message permanently deleted', 'success');
                
                await this.logAdminAction('permanent_delete', archivedId);
                
            } catch (error) {
                console.error('Error deleting message:', error);
                showToast('Failed to delete message', 'error');
            }
        }
    });
};

// ============================================
// NOTIFICATIONS MANAGEMENT
// ============================================

/**
 * Load notifications
 */
adminManager.loadNotifications = async function() {
    try {
        this.showLoading('notifications');
        
        const notificationsQuery = query(
            collection(db, 'notifications'),
            orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(notificationsQuery);
        
        this.state.notifications = [];
        snapshot.forEach(doc => {
            this.state.notifications.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        this.renderNotificationsManagement();
        this.hideLoading('notifications');
        
    } catch (error) {
        console.error('Error loading notifications:', error);
        showToast('Failed to load notifications', 'error');
    }
};

/**
 * Render notifications management
 */
adminManager.renderNotificationsManagement = function() {
    const container = document.querySelector('#notificationsManagement');
    if (!container) return;
    
    const formHtml = `
        <div class="admin-panel">
            <div class="admin-panel-header">
                <h3 class="admin-panel-title">
                    <span class="admin-panel-title-icon">➕</span>
                    Create Notification
                </h3>
            </div>
            <div class="admin-panel-body">
                <form id="notificationForm" class="notification-form">
                    <div class="form-group">
                        <label class="form-label required">Title</label>
                        <input type="text" class="neu-input" id="notifTitle" 
                               placeholder="Notification title" required maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Content</label>
                        <textarea class="neu-input neu-textarea" id="notifContent" 
                                  placeholder="Notification content (optional)" rows="2"
                                  maxlength="200"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Link URL</label>
                        <input type="url" class="neu-input" id="notifLink" 
                               placeholder="https://example.com/resource">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Type</label>
                        <select class="neu-input neu-select" id="notifType">
                            <option value="general">📢 General</option>
                            <option value="notes">📚 Notes</option>
                            <option value="video">🎬 Video</option>
                            <option value="lecture">🎓 Lecture</option>
                            <option value="update">🔄 Update</option>
                            <option value="alert">⚠️ Alert</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Priority</label>
                        <input type="number" class="neu-input" id="notifPriority" 
                               value="0" min="0" max="10">
                        <div class="form-help">Higher priority shows first (0-10)</div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Expires At (optional)</label>
                        <input type="datetime-local" class="neu-input" id="notifExpires">
                    </div>
                    
                    <div class="neu-checkbox-wrapper">
                        <input type="checkbox" id="notifActive" checked>
                        <span class="neu-checkbox"></span>
                        <span class="neu-checkbox-label">Active immediately</span>
                    </div>
                    
                    <div class="notification-preview mt-lg">
                        <div class="notification-preview-title">Preview</div>
                        <div class="notification-preview-bar" id="notifPreview">
                            <span class="notification-icon">📢</span>
                            <span class="notification-content">
                                <strong>Your notification title</strong>
                            </span>
                        </div>
                    </div>
                    
                    <div class="d-flex gap-md mt-xl">
                        <button type="reset" class="neu-button">Reset</button>
                        <button type="submit" class="neu-button neu-button-primary flex-1">
                            Create Notification
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Existing notifications list
    let listHtml = `
        <div class="admin-panel mt-xl">
            <div class="admin-panel-header">
                <h3 class="admin-panel-title">
                    <span class="admin-panel-title-icon">📋</span>
                    Existing Notifications
                </h3>
            </div>
            <div class="admin-panel-body">
    `;
    
    if (this.state.notifications.length === 0) {
        listHtml += `
            <div class="empty-state">
                <span class="empty-state-icon">🔔</span>
                <p class="empty-state-title">No notifications</p>
                <p class="empty-state-text">Create your first notification above</p>
            </div>
        `;
    } else {
        listHtml += `<div class="notification-list">`;
        
        this.state.notifications.forEach(notif => {
            const typeIcons = {
                general: '📢',
                notes: '📚',
                video: '🎬',
                lecture: '🎓',
                update: '🔄',
                alert: '⚠️'
            };
            
            const isExpired = notif.expiresAt && 
                (notif.expiresAt.toDate ? notif.expiresAt.toDate() : new Date(notif.expiresAt)) < new Date();
            
            listHtml += `
                <div class="notification-item ${notif.isActive ? '' : 'inactive'} ${isExpired ? 'expired' : ''}">
                    <div class="notification-item-icon ${notif.type}">
                        ${typeIcons[notif.type] || typeIcons.general}
                    </div>
                    <div class="notification-item-content">
                        <div class="notification-item-title">
                            ${this.escapeHTML(notif.title)}
                            ${isExpired ? '<span class="badge badge-error">Expired</span>' : ''}
                            ${!notif.isActive ? '<span class="badge badge-warning">Inactive</span>' : ''}
                        </div>
                        <div class="notification-item-text">
                            ${this.escapeHTML(notif.content || 'No content')}
                        </div>
                        ${notif.link ? `<a href="${this.escapeHTML(notif.link)}" target="_blank" class="fs-sm">🔗 ${this.escapeHTML(notif.link)}</a>` : ''}
                    </div>
                    <div class="notification-item-status d-flex gap-sm align-center">
                        <span class="fs-sm text-muted">Priority: ${notif.priority || 0}</span>
                        <label class="neu-toggle">
                            <input type="checkbox" ${notif.isActive ? 'checked' : ''}
                                   onchange="adminManager.toggleNotification('${notif.id}', this.checked)">
                            <span class="neu-toggle-slider"></span>
                        </label>
                        <button class="action-btn edit" title="Edit"
                                onclick="adminManager.editNotification('${notif.id}')">
                            ✏️
                        </button>
                        <button class="action-btn delete" title="Delete"
                                onclick="adminManager.deleteNotification('${notif.id}')">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        });
        
        listHtml += `</div>`;
    }
    
    listHtml += `
            </div>
        </div>
    `;
    
    // Google Sheets integration section
    const sheetsHtml = `
        <div class="admin-panel mt-xl">
            <div class="admin-panel-header">
                <h3 class="admin-panel-title">
                    <span class="admin-panel-title-icon">📊</span>
                    Google Sheets Integration
                </h3>
            </div>
            <div class="admin-panel-body">
                <p class="text-secondary mb-md">
                    Connect a Google Sheet to manage notifications in bulk.
                </p>
                
                <div class="form-group">
                    <label class="form-label">Google Sheets Published URL</label>
                    <input type="url" class="neu-input" id="sheetsUrl" 
                           placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv">
                </div>
                
                <div class="form-help mb-lg">
                    <strong>Sheet Format:</strong> Title, Content, Link, Type, Priority, Active (true/false)
                </div>
                
                <div class="d-flex gap-md">
                    <button class="neu-button" onclick="adminManager.saveGoogleSheetsUrl()">
                        💾 Save URL
                    </button>
                    <button class="neu-button neu-button-primary" onclick="adminManager.importFromSheets()">
                        📥 Import Now
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = formHtml + listHtml + sheetsHtml;
    
    // Setup form handlers
    this.setupNotificationFormHandlers();
};

/**
 * Setup notification form handlers
 */
adminManager.setupNotificationFormHandlers = function() {
    const form = document.querySelector('#notificationForm');
    if (!form) return;
    
    // Live preview
    const titleInput = form.querySelector('#notifTitle');
    const contentInput = form.querySelector('#notifContent');
    const typeSelect = form.querySelector('#notifType');
    const preview = document.querySelector('#notifPreview');
    
    const updatePreview = () => {
        const typeIcons = {
            general: '📢',
            notes: '📚',
            video: '🎬',
            lecture: '🎓',
            update: '🔄',
            alert: '⚠️'
        };
        
        const type = typeSelect?.value || 'general';
        const title = titleInput?.value || 'Your notification title';
        const content = contentInput?.value || '';
        
        if (preview) {
            preview.className = `notification-preview-bar notification-${type}`;
            preview.innerHTML = `
                <span class="notification-icon">${typeIcons[type]}</span>
                <span class="notification-content">
                    <strong>${this.escapeHTML(title)}</strong>
                    ${content ? ` - ${this.escapeHTML(content)}` : ''}
                </span>
            `;
        }
    };
    
    titleInput?.addEventListener('input', updatePreview);
    contentInput?.addEventListener('input', updatePreview);
    typeSelect?.addEventListener('change', updatePreview);
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createNotification();
    });
};

/**
 * Create new notification
 */
adminManager.createNotification = async function() {
    const form = document.querySelector('#notificationForm');
    if (!form) return;
    
    const title = form.querySelector('#notifTitle')?.value?.trim();
    const content = form.querySelector('#notifContent')?.value?.trim();
    const link = form.querySelector('#notifLink')?.value?.trim();
    const type = form.querySelector('#notifType')?.value;
    const priority = parseInt(form.querySelector('#notifPriority')?.value) || 0;
    const expiresStr = form.querySelector('#notifExpires')?.value;
    const isActive = form.querySelector('#notifActive')?.checked;
    
    if (!title) {
        showToast('Please enter a title', 'error');
        return;
    }
    
    try {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Creating...';
        }
        
        const notificationData = {
            title,
            content: content || '',
            link: link || '',
            type: type || 'general',
            priority,
            expiresAt: expiresStr ? Timestamp.fromDate(new Date(expiresStr)) : null,
            isActive: isActive !== false,
            createdAt: serverTimestamp(),
            createdBy: getCurrentUser()?.uid
        };
        
        await addDoc(collection(db, 'notifications'), notificationData);
        
        form.reset();
        showToast('Notification created successfully', 'success');
        
        // Reload notifications
        await this.loadNotifications();
        
    } catch (error) {
        console.error('Error creating notification:', error);
        showToast('Failed to create notification', 'error');
    }
};

/**
 * Toggle notification active status
 * @param {string} notificationId - Notification ID
 * @param {boolean} isActive - New active status
 */
adminManager.toggleNotification = async function(notificationId, isActive) {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), {
            isActive: isActive
        });
        
        // Update local state
        const notifIndex = this.state.notifications.findIndex(n => n.id === notificationId);
        if (notifIndex >= 0) {
            this.state.notifications[notifIndex].isActive = isActive;
        }
        
        showToast(`Notification ${isActive ? 'activated' : 'deactivated'}`, 'success');
        
    } catch (error) {
        console.error('Error toggling notification:', error);
        showToast('Failed to update notification', 'error');
    }
};

/**
 * Edit notification
 * @param {string} notificationId - Notification ID
 */
adminManager.editNotification = function(notificationId) {
    const notification = this.state.notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    let modal = document.querySelector('#editNotificationModal');
    
    if (!modal) {
        modal = this.createModal('editNotificationModal', 'Edit Notification');
    }
    
    const expiresDate = notification.expiresAt ? 
        (notification.expiresAt.toDate ? notification.expiresAt.toDate() : new Date(notification.expiresAt)) : null;
    const expiresStr = expiresDate ? expiresDate.toISOString().slice(0, 16) : '';
    
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
        <form id="editNotificationForm">
            <div class="form-group">
                <label class="form-label required">Title</label>
                <input type="text" class="neu-input" id="editNotifTitle" 
                       value="${this.escapeHTML(notification.title)}" required maxlength="100">
            </div>
            
            <div class="form-group">
                <label class="form-label">Content</label>
                <textarea class="neu-input neu-textarea" id="editNotifContent" 
                          rows="2" maxlength="200">${this.escapeHTML(notification.content || '')}</textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label">Link URL</label>
                <input type="url" class="neu-input" id="editNotifLink" 
                       value="${this.escapeHTML(notification.link || '')}">
            </div>
            
            <div class="form-group">
                <label class="form-label">Type</label>
                <select class="neu-input neu-select" id="editNotifType">
                    <option value="general" ${notification.type === 'general' ? 'selected' : ''}>📢 General</option>
                    <option value="notes" ${notification.type === 'notes' ? 'selected' : ''}>📚 Notes</option>
                    <option value="video" ${notification.type === 'video' ? 'selected' : ''}>🎬 Video</option>
                    <option value="lecture" ${notification.type === 'lecture' ? 'selected' : ''}>🎓 Lecture</option>
                    <option value="update" ${notification.type === 'update' ? 'selected' : ''}>🔄 Update</option>
                    <option value="alert" ${notification.type === 'alert' ? 'selected' : ''}>⚠️ Alert</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">Priority</label>
                <input type="number" class="neu-input" id="editNotifPriority" 
                       value="${notification.priority || 0}" min="0" max="10">
            </div>
            
            <div class="form-group">
                <label class="form-label">Expires At</label>
                <input type="datetime-local" class="neu-input" id="editNotifExpires"
                       value="${expiresStr}">
            </div>
            
            <div class="neu-checkbox-wrapper">
                <input type="checkbox" id="editNotifActive" ${notification.isActive ? 'checked' : ''}>
                <span class="neu-checkbox"></span>
                <span class="neu-checkbox-label">Active</span>
            </div>
        </form>
    `;
    
    const modalFooter = modal.querySelector('.modal-footer');
    modalFooter.innerHTML = `
        <button class="neu-button" onclick="adminManager.closeAllModals()">Cancel</button>
        <button class="neu-button neu-button-primary" onclick="adminManager.saveNotification('${notificationId}')">
            💾 Save Changes
        </button>
    `;
    
    modal.classList.add('active');
};

/**
 * Save notification changes
 * @param {string} notificationId - Notification ID
 */
adminManager.saveNotification = async function(notificationId) {
    const modal = document.querySelector('#editNotificationModal');
    if (!modal) return;
    
    const title = modal.querySelector('#editNotifTitle')?.value?.trim();
    const content = modal.querySelector('#editNotifContent')?.value?.trim();
    const link = modal.querySelector('#editNotifLink')?.value?.trim();
    const type = modal.querySelector('#editNotifType')?.value;
    const priority = parseInt(modal.querySelector('#editNotifPriority')?.value) || 0;
    const expiresStr = modal.querySelector('#editNotifExpires')?.value;
    const isActive = modal.querySelector('#editNotifActive')?.checked;
    
    if (!title) {
        showToast('Please enter a title', 'error');
        return;
    }
    
    try {
        await updateDoc(doc(db, 'notifications', notificationId), {
            title,
            content: content || '',
            link: link || '',
            type: type || 'general',
            priority,
            expiresAt: expiresStr ? Timestamp.fromDate(new Date(expiresStr)) : null,
            isActive: isActive !== false,
            updatedAt: serverTimestamp()
        });
        
        this.closeAllModals();
        showToast('Notification updated successfully', 'success');
        
        // Reload notifications
        await this.loadNotifications();
        
    } catch (error) {
        console.error('Error updating notification:', error);
        showToast('Failed to update notification', 'error');
    }
};

/**
 * Delete notification
 * @param {string} notificationId - Notification ID
 */
adminManager.deleteNotification = function(notificationId) {
    this.showConfirmModal({
        title: 'Delete Notification',
        message: 'Are you sure you want to delete this notification?',
        icon: '🗑️',
        iconClass: 'warning',
        confirmText: 'Delete',
        confirmClass: 'neu-button-danger',
        onConfirm: async () => {
            try {
                await deleteDoc(doc(db, 'notifications', notificationId));
                
                // Remove from local state
                this.state.notifications = this.state.notifications.filter(
                    n => n.id !== notificationId
                );
                
                this.renderNotificationsManagement();
                showToast('Notification deleted', 'success');
                
            } catch (error) {
                console.error('Error deleting notification:', error);
                showToast('Failed to delete notification', 'error');
            }
        }
    });
};

/**
 * Save Google Sheets URL
 */
adminManager.saveGoogleSheetsUrl = async function() {
    const urlInput = document.querySelector('#sheetsUrl');
    const url = urlInput?.value?.trim();
    
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    
    try {
        // Save to admin settings
        await updateDoc(doc(db, 'settings', 'notifications'), {
            googleSheetsUrl: url,
            updatedAt: serverTimestamp()
        });
        
        showToast('Google Sheets URL saved', 'success');
        
    } catch (error) {
        // If document doesn't exist, create it
        try {
            await setDoc(doc(db, 'settings', 'notifications'), {
                googleSheetsUrl: url,
                createdAt: serverTimestamp()
            });
            showToast('Google Sheets URL saved', 'success');
        } catch (e) {
            console.error('Error saving URL:', e);
            showToast('Failed to save URL', 'error');
        }
    }
};

/**
 * Import notifications from Google Sheets
 */
adminManager.importFromSheets = async function() {
    const urlInput = document.querySelector('#sheetsUrl');
    const url = urlInput?.value?.trim();
    
    if (!url) {
        showToast('Please enter a Google Sheets URL first', 'error');
        return;
    }
    
    try {
        showToast('Fetching from Google Sheets...', 'info');
        
        const response = await fetch(url);
        const text = await response.text();
        
        // Parse CSV
        const lines = text.split('\n');
        if (lines.length < 2) {
            showToast('No data found in sheet', 'warning');
            return;
        }
        
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        let imported = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length < headers.length) continue;
            
            const data = {};
            headers.forEach((header, index) => {
                data[header] = values[index]?.trim();
            });
            
            if (!data.title) continue;
            
            // Create notification
            await addDoc(collection(db, 'notifications'), {
                title: data.title,
                content: data.content || '',
                link: data.link || '',
                type: data.type || 'general',
                priority: parseInt(data.priority) || 0,
                isActive: data.active?.toLowerCase() === 'true',
                createdAt: serverTimestamp(),
                source: 'sheets'
            });
            
            imported++;
        }
        
        showToast(`Imported ${imported} notifications`, 'success');
        await this.loadNotifications();
        
    } catch (error) {
        console.error('Error importing from sheets:', error);
        showToast('Failed to import from Google Sheets', 'error');
    }
};

// ============================================
// HELPER METHODS
// ============================================

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
adminManager.truncateText = function(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
};

/**
 * Show loading for section
 * @param {string} section - Section name
 */
adminManager.showLoading = function(section) {
    const sectionEl = document.querySelector(`#${section}Section`);
    if (!sectionEl) return;
    
    let loader = sectionEl.querySelector('.section-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'section-loader d-flex align-center justify-center p-xl';
        loader.innerHTML = `
            <div class="spinner"></div>
            <span class="ml-md">Loading...</span>
        `;
        sectionEl.insertBefore(loader, sectionEl.firstChild);
    }
    loader.style.display = 'flex';
};

/**
 * Hide loading for section
 * @param {string} section - Section name
 */
adminManager.hideLoading = function(section) {
    const sectionEl = document.querySelector(`#${section}Section`);
    if (!sectionEl) return;
    
    const loader = sectionEl.querySelector('.section-loader');
    if (loader) {
        loader.style.display = 'none';
    }
};

// ============================================
// INJECT ADMIN EXTRA STYLES
// ============================================
(function injectAdminExtraStyles() {
    if (document.getElementById('admin-extra-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'admin-extra-styles';
    style.textContent = `
        /* Admin Message Item */
        .admin-message-item {
            display: flex;
            gap: 12px;
            padding: 12px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 2px solid transparent;
        }
        
        .admin-message-item:hover {
            background: var(--bg-secondary);
        }
        
        .admin-message-item.selected {
            background: var(--accent-primary-light);
            border-color: var(--accent-primary);
        }
        
        .admin-message-item.pinned {
            border-left: 3px solid var(--accent-primary);
        }
        
        .admin-message-thumb {
            max-width: 60px;
            border-radius: 4px;
            margin-top: 4px;
        }
        
        /* Activity Item */
        .activity-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-bottom: 1px solid var(--divider-color);
        }
        
        .activity-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
        }
        
        .activity-content {
            flex: 1;
        }
        
        .activity-user {
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .activity-action {
            color: var(--text-secondary);
            margin: 0 4px;
        }
        
        .activity-time {
            color: var(--text-tertiary);
            font-size: 12px;
        }
        
        /* Notification Item Inactive */
        .notification-item.inactive {
            opacity: 0.6;
        }
        
        .notification-item.expired {
            background: var(--error-light);
        }
        
        /* Section Loader */
        .section-loader {
            min-height: 200px;
        }
        
        /* Chat Management Layout */
        .chat-management-grid {
            display: grid;
            grid-template-columns: 1fr 350px;
            gap: 24px;
            height: calc(100vh - 200px);
        }
        
        @media (max-width: 1024px) {
            .chat-management-grid {
                grid-template-columns: 1fr;
                height: auto;
            }
        }
        
        /* Quick Stats */
        .quick-stats-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .quick-stat {
            background: var(--bg-primary);
            padding: 16px;
            border-radius: 12px;
            box-shadow: var(--neu-shadow-sm);
            text-align: center;
        }
        
        .quick-stat-value {
            font-size: 28px;
            font-weight: 700;
            color: var(--text-primary);
        }
        
        .quick-stat-label {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 4px;
        }
    `;
    
    document.head.appendChild(style);
})();

// ============================================
// INITIALIZE ADMIN PANEL
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if on admin page
    if (document.querySelector('.admin-wrapper')) {
        // Initialize after auth is ready
        setTimeout(() => {
            adminManager.init();
        }, 500);
    }
});

// ============================================
// EXPORTS
// ============================================
export {
    adminManager,
    ADMIN_CONFIG
};

console.log('👑 Admin System (Part 2) - Chat, Archives, Notifications loaded');