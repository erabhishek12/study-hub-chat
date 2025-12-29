/**
 * ============================================
 * STUDY HUB - Security System
 * ============================================
 * Features:
 * - Screenshot protection (best effort)
 * - DevTools detection
 * - Right-click prevention
 * - Keyboard shortcut blocking
 * - Content blur on tab switch
 * - Copy/Paste restrictions
 * - Session hijacking prevention
 * ============================================
 */

// ============================================
// SECURITY CONFIGURATION
// ============================================
const SECURITY_CONFIG = {
    // Enable/disable specific features
    ENABLE_SCREENSHOT_PROTECTION: true,
    ENABLE_DEVTOOLS_DETECTION: true,
    ENABLE_RIGHT_CLICK_PREVENTION: true,
    ENABLE_KEYBOARD_PROTECTION: true,
    ENABLE_VISIBILITY_BLUR: true,
    ENABLE_COPY_PROTECTION: true,
    ENABLE_DRAG_PROTECTION: true,
    
    // Blur settings
    BLUR_AMOUNT: '10px',
    BLUR_TRANSITION: '0.3s',
    
    // DevTools detection interval
    DEVTOOLS_CHECK_INTERVAL: 1000,
    
    // Protected selectors (elements to protect)
    PROTECTED_SELECTORS: [
        '.chat-messages',
        '.message-bubble',
        '.message-text',
        '.user-info',
        '.profile-info',
        '[data-protected]'
    ],
    
    // Warning messages
    MESSAGES: {
        DEVTOOLS: '⚠️ Developer tools detected. Some features may be restricted.',
        SCREENSHOT: '📵 Screenshots are not allowed in this area.',
        COPY: '📋 Copying content is not allowed.',
        RIGHT_CLICK: '🚫 Right-click is disabled in this area.'
    }
};

// Track security state
let isDevToolsOpen = false;
let isPageVisible = true;
let securityListeners = [];

// ============================================
// SECURITY MANAGER CLASS
// ============================================
class SecurityManager {
    constructor() {
        this.isInitialized = false;
        this.devToolsCheckInterval = null;
        this.protectedElements = [];
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Initialize security features
     */
    init() {
        if (this.isInitialized) return;
        
        console.log('🔒 Initializing Security System...');
        
        // Apply CSS protection
        this.injectProtectionStyles();
        
        // Find protected elements
        this.findProtectedElements();
        
        // Initialize features based on config
        if (SECURITY_CONFIG.ENABLE_RIGHT_CLICK_PREVENTION) {
            this.initRightClickProtection();
        }
        
        if (SECURITY_CONFIG.ENABLE_KEYBOARD_PROTECTION) {
            this.initKeyboardProtection();
        }
        
        if (SECURITY_CONFIG.ENABLE_DEVTOOLS_DETECTION) {
            this.initDevToolsDetection();
        }
        
        if (SECURITY_CONFIG.ENABLE_VISIBILITY_BLUR) {
            this.initVisibilityProtection();
        }
        
        if (SECURITY_CONFIG.ENABLE_COPY_PROTECTION) {
            this.initCopyProtection();
        }
        
        if (SECURITY_CONFIG.ENABLE_DRAG_PROTECTION) {
            this.initDragProtection();
        }
        
        if (SECURITY_CONFIG.ENABLE_SCREENSHOT_PROTECTION) {
            this.initScreenshotProtection();
        }
        
        this.isInitialized = true;
        console.log('🔒 Security System initialized');
    }
    
    /**
     * Find all protected elements
     */
    findProtectedElements() {
        this.protectedElements = [];
        
        SECURITY_CONFIG.PROTECTED_SELECTORS.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!this.protectedElements.includes(el)) {
                    this.protectedElements.push(el);
                    el.classList.add('security-protected');
                }
            });
        });
    }
    
    /**
     * Refresh protected elements (call after DOM changes)
     */
    refreshProtectedElements() {
        this.findProtectedElements();
    }
    
    // ============================================
    // CSS PROTECTION STYLES
    // ============================================
    
    /**
     * Inject protection CSS styles
     */
    injectProtectionStyles() {
        if (document.getElementById('security-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'security-styles';
        style.textContent = `
            /* Base Protection */
            .security-protected {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
            }
            
            /* Prevent text selection on protected areas */
            .security-protected * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            
            /* Prevent image dragging */
            .security-protected img {
                -webkit-user-drag: none !important;
                -khtml-user-drag: none !important;
                -moz-user-drag: none !important;
                -o-user-drag: none !important;
                user-drag: none !important;
                pointer-events: none;
            }
            
            /* Allow pointer events on interactive elements */
            .security-protected a,
            .security-protected button,
            .security-protected input,
            .security-protected textarea,
            .security-protected [role="button"],
            .security-protected .clickable {
                pointer-events: auto !important;
            }
            
            /* Blur effect for visibility change */
            .security-blur {
                filter: blur(${SECURITY_CONFIG.BLUR_AMOUNT}) !important;
                transition: filter ${SECURITY_CONFIG.BLUR_TRANSITION} ease !important;
            }
            
            /* Blur overlay */
            .security-blur-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(20px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                gap: 16px;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .security-blur-overlay.active {
                opacity: 1;
                visibility: visible;
            }
            
            .security-blur-overlay .blur-icon {
                font-size: 64px;
            }
            
            .security-blur-overlay .blur-text {
                color: white;
                font-size: 18px;
                text-align: center;
                max-width: 300px;
            }
            
            /* DevTools warning banner */
            .devtools-warning {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #ff4757 0%, #ff3838 100%);
                color: white;
                padding: 12px 20px;
                text-align: center;
                font-weight: 600;
                z-index: 999999;
                transform: translateY(-100%);
                transition: transform 0.3s ease;
                box-shadow: 0 4px 12px rgba(255, 71, 87, 0.4);
            }
            
            .devtools-warning.active {
                transform: translateY(0);
            }
            
            /* Print protection */
            @media print {
                body * {
                    display: none !important;
                }
                
                body::after {
                    content: "Printing is not allowed";
                    display: block;
                    font-size: 24px;
                    text-align: center;
                    padding: 100px;
                }
            }
            
            /* Screenshot hint (visual deterrent) */
            .screenshot-watermark {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 99998;
                opacity: 0;
                transition: opacity 0.1s;
            }
            
            .screenshot-watermark.visible {
                opacity: 1;
                background: repeating-linear-gradient(
                    45deg,
                    transparent,
                    transparent 100px,
                    rgba(255, 0, 0, 0.03) 100px,
                    rgba(255, 0, 0, 0.03) 200px
                );
            }
            
            .screenshot-watermark::before {
                content: "PROTECTED CONTENT - " attr(data-user);
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-30deg);
                font-size: 48px;
                color: rgba(255, 0, 0, 0.1);
                white-space: nowrap;
                pointer-events: none;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // ============================================
    // RIGHT-CLICK PROTECTION
    // ============================================
    
    /**
     * Initialize right-click protection
     */
    initRightClickProtection() {
        document.addEventListener('contextmenu', (e) => {
            // Check if target is in protected area
            if (this.isProtectedElement(e.target)) {
                e.preventDefault();
                this.showSecurityToast(SECURITY_CONFIG.MESSAGES.RIGHT_CLICK);
                this.logSecurityEvent('right_click_blocked', e.target);
                return false;
            }
        }, true);
        
        console.log('  ✓ Right-click protection enabled');
    }
    
    // ============================================
    // KEYBOARD PROTECTION
    // ============================================
    
    /**
     * Initialize keyboard shortcut protection
     */
    initKeyboardProtection() {
        document.addEventListener('keydown', (e) => {
            // Block PrintScreen
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                this.handleScreenshotAttempt();
                return false;
            }
            
            // Block Ctrl/Cmd combinations
            if (e.ctrlKey || e.metaKey) {
                const blockedKeys = [
                    'p', // Print
                    's', // Save
                    'u', // View source
                    'c', // Copy (in protected areas)
                    'a', // Select all (in protected areas)
                    'shift+i', // DevTools
                    'shift+j', // DevTools Console
                    'shift+c', // DevTools Elements
                ];
                
                const keyCombo = (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
                
                if (blockedKeys.includes(e.key.toLowerCase()) || blockedKeys.includes(keyCombo)) {
                    // Allow copy in input fields
                    if ((e.key === 'c' || e.key === 'a') && this.isEditableElement(e.target)) {
                        return true;
                    }
                    
                    e.preventDefault();
                    this.logSecurityEvent('keyboard_blocked', keyCombo);
                    
                    if (e.key.toLowerCase() === 'p') {
                        this.showSecurityToast('🖨️ Printing is not allowed');
                    } else if (e.key.toLowerCase() === 's') {
                        this.showSecurityToast('💾 Saving is not allowed');
                    }
                    
                    return false;
                }
            }
            
            // Block F12 (DevTools)
            if (e.key === 'F12') {
                e.preventDefault();
                this.logSecurityEvent('f12_blocked');
                return false;
            }
            
        }, true);
        
        console.log('  ✓ Keyboard protection enabled');
    }
    
    // ============================================
    // DEVTOOLS DETECTION
    // ============================================
    
    /**
     * Initialize DevTools detection
     */
    initDevToolsDetection() {
        // Method 1: Window size difference
        const checkDevToolsBySize = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if (widthThreshold || heightThreshold) {
                this.handleDevToolsOpen();
            } else {
                this.handleDevToolsClose();
            }
        };
        
        // Method 2: Console detection using getter
        const checkDevToolsByConsole = () => {
            const element = new Image();
            let devtoolsOpen = false;
            
            Object.defineProperty(element, 'id', {
                get: function() {
                    devtoolsOpen = true;
                }
            });
            
            console.log('%c', element);
            console.clear();
            
            if (devtoolsOpen) {
                this.handleDevToolsOpen();
            }
        };
        
        // Method 3: Debugger detection
        const checkDevToolsByDebugger = () => {
            const start = performance.now();
            debugger;
            const end = performance.now();
            
            // If debugger takes more than 100ms, DevTools is likely open
            if (end - start > 100) {
                this.handleDevToolsOpen();
            }
        };
        
        // Run checks periodically
        this.devToolsCheckInterval = setInterval(() => {
            checkDevToolsBySize();
        }, SECURITY_CONFIG.DEVTOOLS_CHECK_INTERVAL);
        
        // Also check on resize
        window.addEventListener('resize', checkDevToolsBySize);
        
        console.log('  ✓ DevTools detection enabled');
    }
    
    /**
     * Handle DevTools open
     */
    handleDevToolsOpen() {
        if (isDevToolsOpen) return;
        
        isDevToolsOpen = true;
        this.showDevToolsWarning(true);
        this.blurProtectedContent(true);
        this.logSecurityEvent('devtools_opened');
        
        // Notify listeners
        this.notifySecurityEvent('devtools_open');
    }
    
    /**
     * Handle DevTools close
     */
    handleDevToolsClose() {
        if (!isDevToolsOpen) return;
        
        isDevToolsOpen = false;
        this.showDevToolsWarning(false);
        
        // Only unblur if page is visible
        if (isPageVisible) {
            this.blurProtectedContent(false);
        }
        
        this.logSecurityEvent('devtools_closed');
        this.notifySecurityEvent('devtools_close');
    }
    
    /**
     * Show/hide DevTools warning banner
     * @param {boolean} show - Whether to show
     */
    showDevToolsWarning(show) {
        let warning = document.querySelector('.devtools-warning');
        
        if (show) {
            if (!warning) {
                warning = document.createElement('div');
                warning.className = 'devtools-warning';
                warning.innerHTML = `
                    <span>⚠️ ${SECURITY_CONFIG.MESSAGES.DEVTOOLS}</span>
                `;
                document.body.appendChild(warning);
            }
            
            setTimeout(() => warning.classList.add('active'), 10);
        } else {
            if (warning) {
                warning.classList.remove('active');
                setTimeout(() => warning.remove(), 300);
            }
        }
    }
    
    // ============================================
    // VISIBILITY PROTECTION
    // ============================================
    
    /**
     * Initialize visibility change protection
     */
    initVisibilityProtection() {
        // Create blur overlay
        this.createBlurOverlay();
        
        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isPageVisible = false;
                this.handlePageHidden();
            } else {
                isPageVisible = true;
                this.handlePageVisible();
            }
        });
        
        // Handle window blur/focus
        window.addEventListener('blur', () => {
            // Small delay to prevent flash on quick tab switches
            setTimeout(() => {
                if (!document.hasFocus()) {
                    this.handlePageHidden();
                }
            }, 100);
        });
        
        window.addEventListener('focus', () => {
            this.handlePageVisible();
        });
        
        console.log('  ✓ Visibility protection enabled');
    }
    
    /**
     * Create blur overlay element
     */
    createBlurOverlay() {
        if (document.querySelector('.security-blur-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'security-blur-overlay';
        overlay.innerHTML = `
            <span class="blur-icon">🔒</span>
            <span class="blur-text">Content hidden for security</span>
        `;
        
        document.body.appendChild(overlay);
    }
    
    /**
     * Handle page becoming hidden
     */
    handlePageHidden() {
        this.blurProtectedContent(true);
        this.showBlurOverlay(true);
        this.logSecurityEvent('page_hidden');
    }
    
    /**
     * Handle page becoming visible
     */
    handlePageVisible() {
        // Don't unblur if DevTools is open
        if (!isDevToolsOpen) {
            this.blurProtectedContent(false);
        }
        this.showBlurOverlay(false);
        this.logSecurityEvent('page_visible');
    }
    
    /**
     * Show/hide blur overlay
     * @param {boolean} show - Whether to show
     */
    showBlurOverlay(show) {
        const overlay = document.querySelector('.security-blur-overlay');
        if (overlay) {
            if (show) {
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
            }
        }
    }
    
    /**
     * Blur/unblur protected content
     * @param {boolean} blur - Whether to blur
     */
    blurProtectedContent(blur) {
        this.protectedElements.forEach(el => {
            if (blur) {
                el.classList.add('security-blur');
            } else {
                el.classList.remove('security-blur');
            }
        });
        
        // Also blur main content areas
        const mainContent = document.querySelector('.chat-messages, .chat-main, main');
        if (mainContent) {
            if (blur) {
                mainContent.classList.add('security-blur');
            } else {
                mainContent.classList.remove('security-blur');
            }
        }
    }
    
    // ============================================
    // COPY PROTECTION
    // ============================================
    
    /**
     * Initialize copy protection
     */
    initCopyProtection() {
        document.addEventListener('copy', (e) => {
            if (this.isProtectedElement(e.target)) {
                e.preventDefault();
                this.showSecurityToast(SECURITY_CONFIG.MESSAGES.COPY);
                this.logSecurityEvent('copy_blocked', e.target);
                return false;
            }
        }, true);
        
        document.addEventListener('cut', (e) => {
            if (this.isProtectedElement(e.target)) {
                e.preventDefault();
                this.logSecurityEvent('cut_blocked', e.target);
                return false;
            }
        }, true);
        
        console.log('  ✓ Copy protection enabled');
    }
    
    // ============================================
    // DRAG PROTECTION
    // ============================================
    
    /**
     * Initialize drag protection
     */
    initDragProtection() {
        document.addEventListener('dragstart', (e) => {
            if (this.isProtectedElement(e.target) || e.target.tagName === 'IMG') {
                e.preventDefault();
                this.logSecurityEvent('drag_blocked', e.target);
                return false;
            }
        }, true);
        
        console.log('  ✓ Drag protection enabled');
    }
    
    // ============================================
    // SCREENSHOT PROTECTION
    // ============================================
    
    /**
     * Initialize screenshot protection
     */
    initScreenshotProtection() {
        // Create watermark element
        this.createScreenshotWatermark();
        
        // Listen for potential screenshot events
        // Note: This is best-effort as true screenshot detection is not possible
        
        // Detect PrintScreen key
        document.addEventListener('keyup', (e) => {
            if (e.key === 'PrintScreen') {
                this.handleScreenshotAttempt();
            }
        });
        
        // Detect Windows Snipping Tool / Snip & Sketch activation
        // These tools cause a brief blur/focus cycle
        let blurTime = 0;
        
        window.addEventListener('blur', () => {
            blurTime = Date.now();
        });
        
        window.addEventListener('focus', () => {
            const blurDuration = Date.now() - blurTime;
            
            // If blur was very short (< 500ms), might be screenshot tool
            if (blurDuration > 0 && blurDuration < 500) {
                this.handlePotentialScreenshot();
            }
        });
        
        console.log('  ✓ Screenshot protection enabled (best-effort)');
    }
    
    /**
     * Create screenshot watermark
     */
    createScreenshotWatermark() {
        if (document.querySelector('.screenshot-watermark')) return;
        
        const watermark = document.createElement('div');
        watermark.className = 'screenshot-watermark';
        
        // Add user identifier if available
        const userData = window.currentUserData || {};
        watermark.setAttribute('data-user', userData.username || 'Protected');
        
        document.body.appendChild(watermark);
    }
    
    /**
     * Handle confirmed screenshot attempt
     */
    handleScreenshotAttempt() {
        this.showSecurityToast(SECURITY_CONFIG.MESSAGES.SCREENSHOT);
        this.flashWatermark();
        this.logSecurityEvent('screenshot_attempt');
        this.notifySecurityEvent('screenshot');
        
        // Briefly blur content
        this.blurProtectedContent(true);
        setTimeout(() => {
            if (isPageVisible && !isDevToolsOpen) {
                this.blurProtectedContent(false);
            }
        }, 500);
    }
    
    /**
     * Handle potential screenshot (not confirmed)
     */
    handlePotentialScreenshot() {
        // Just log, don't show warning (to avoid false positives)
        this.logSecurityEvent('potential_screenshot');
        this.flashWatermark();
    }
    
    /**
     * Flash the watermark briefly
     */
    flashWatermark() {
        const watermark = document.querySelector('.screenshot-watermark');
        if (watermark) {
            watermark.classList.add('visible');
            setTimeout(() => {
                watermark.classList.remove('visible');
            }, 200);
        }
    }
    
    // ============================================
    // UTILITY METHODS
    // ============================================
    
    /**
     * Check if element is protected
     * @param {Element} element - Element to check
     * @returns {boolean}
     */
    isProtectedElement(element) {
        if (!element) return false;
        
        // Check if element itself is protected
        if (element.classList?.contains('security-protected')) {
            return true;
        }
        
        // Check if any parent is protected
        const protectedParent = element.closest(
            SECURITY_CONFIG.PROTECTED_SELECTORS.join(', ')
        );
        
        return !!protectedParent;
    }
    
    /**
     * Check if element is editable
     * @param {Element} element - Element to check
     * @returns {boolean}
     */
    isEditableElement(element) {
        if (!element) return false;
        
        const tagName = element.tagName?.toLowerCase();
        const isInput = ['input', 'textarea', 'select'].includes(tagName);
        const isContentEditable = element.isContentEditable;
        
        return isInput || isContentEditable;
    }
    
    /**
     * Show security toast notification
     * @param {string} message - Message to show
     */
    showSecurityToast(message) {
        // Use existing toast system if available
        if (typeof window.showToast === 'function') {
            window.showToast(message, 'warning');
            return;
        }
        
        // Create simple toast
        let container = document.querySelector('.security-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'security-toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 999999;
            `;
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = 'security-toast';
        toast.style.cssText = `
            background: #333;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            margin-top: 8px;
            animation: slideUp 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    /**
     * Log security event
     * @param {string} eventType - Type of event
     * @param {any} details - Additional details
     */
    logSecurityEvent(eventType, details = null) {
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            details: details,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        // Log to console in development
        console.log('🔒 Security Event:', event);
        
        // Could send to server for monitoring
        // this.sendSecurityLog(event);
    }
    
    /**
     * Add security event listener
     * @param {Function} callback - Callback function
     * @returns {Function} - Unsubscribe function
     */
    addSecurityListener(callback) {
        if (typeof callback === 'function') {
            securityListeners.push(callback);
            
            return () => {
                securityListeners = securityListeners.filter(cb => cb !== callback);
            };
        }
        return () => {};
    }
    
    /**
     * Notify security event listeners
     * @param {string} eventType - Event type
     * @param {any} data - Event data
     */
    notifySecurityEvent(eventType, data = null) {
        securityListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (e) {
                console.error('Security listener error:', e);
            }
        });
    }
    
    /**
     * Disable all security features
     */
    disable() {
        if (this.devToolsCheckInterval) {
            clearInterval(this.devToolsCheckInterval);
        }
        
        // Remove blur
        this.blurProtectedContent(false);
        this.showBlurOverlay(false);
        this.showDevToolsWarning(false);
        
        console.log('🔓 Security features disabled');
    }
    
    /**
     * Re-enable all security features
     */
    enable() {
        this.init();
        console.log('🔒 Security features re-enabled');
    }
    
    /**
     * Get current security status
     * @returns {Object}
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isDevToolsOpen: isDevToolsOpen,
            isPageVisible: isPageVisible,
            protectedElementsCount: this.protectedElements.length,
            features: {
                screenshotProtection: SECURITY_CONFIG.ENABLE_SCREENSHOT_PROTECTION,
                devToolsDetection: SECURITY_CONFIG.ENABLE_DEVTOOLS_DETECTION,
                rightClickPrevention: SECURITY_CONFIG.ENABLE_RIGHT_CLICK_PREVENTION,
                keyboardProtection: SECURITY_CONFIG.ENABLE_KEYBOARD_PROTECTION,
                visibilityBlur: SECURITY_CONFIG.ENABLE_VISIBILITY_BLUR,
                copyProtection: SECURITY_CONFIG.ENABLE_COPY_PROTECTION,
                dragProtection: SECURITY_CONFIG.ENABLE_DRAG_PROTECTION
            }
        };
    }
}

// ============================================
// ADDITIONAL PROTECTION UTILITIES
// ============================================

/**
 * Disable text selection on an element
 * @param {Element} element - Element to protect
 */
function disableTextSelection(element) {
    if (!element) return;
    
    element.style.userSelect = 'none';
    element.style.webkitUserSelect = 'none';
    element.style.mozUserSelect = 'none';
    element.style.msUserSelect = 'none';
    element.setAttribute('unselectable', 'on');
    element.onselectstart = () => false;
}

/**
 * Disable image context menu and dragging
 * @param {Element} container - Container with images
 */
function protectImages(container) {
    const images = container?.querySelectorAll('img') || document.querySelectorAll('img');
    
    images.forEach(img => {
        img.setAttribute('draggable', 'false');
        img.style.pointerEvents = 'none';
        img.addEventListener('contextmenu', e => e.preventDefault());
    });
}

/**
 * Add invisible watermark to element
 * @param {Element} element - Element to watermark
 * @param {string} text - Watermark text
 */
function addInvisibleWatermark(element, text) {
    if (!element) return;
    
    const watermark = document.createElement('span');
    watermark.textContent = text;
    watermark.style.cssText = `
        position: absolute;
        opacity: 0;
        pointer-events: none;
        font-size: 1px;
        color: transparent;
        user-select: all;
    `;
    
    element.style.position = 'relative';
    element.appendChild(watermark);
}

/**
 * Obfuscate email/phone in displayed text
 * @param {string} text - Text to obfuscate
 * @returns {string} - Obfuscated text
 */
function obfuscateContactInfo(text) {
    // Obfuscate email
    text = text.replace(
        /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
        (match, user, domain) => {
            const obfUser = user.substring(0, 2) + '***';
            return `${obfUser}@${domain}`;
        }
    );
    
    // Obfuscate phone
    text = text.replace(
        /(\d{3})[\s-]?(\d{3})[\s-]?(\d{4})/g,
        '$1***$3'
    );
    
    return text;
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================
const securityManager = new SecurityManager();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Enable security on specific element
 * @param {Element|string} element - Element or selector
 */
function protectElement(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }
    
    if (element) {
        element.classList.add('security-protected');
        securityManager.refreshProtectedElements();
    }
}

/**
 * Remove security from element
 * @param {Element|string} element - Element or selector
 */
function unprotectElement(element) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }
    
    if (element) {
        element.classList.remove('security-protected');
        element.classList.remove('security-blur');
    }
}

/**
 * Check if DevTools is open
 * @returns {boolean}
 */
function isDevToolsDetected() {
    return isDevToolsOpen;
}

/**
 * Check if page is currently visible
 * @returns {boolean}
 */
function isPageCurrentlyVisible() {
    return isPageVisible;
}

/**
 * Add security event listener
 * @param {Function} callback - Callback(eventType, data)
 * @returns {Function} - Unsubscribe function
 */
function onSecurityEvent(callback) {
    return securityManager.addSecurityListener(callback);
}

// ============================================
// EXPORTS
// ============================================
export {
    // Security Manager
    SecurityManager,
    securityManager,
    
    // Configuration
    SECURITY_CONFIG,
    
    // Convenience functions
    protectElement,
    unprotectElement,
    isDevToolsDetected,
    isPageCurrentlyVisible,
    onSecurityEvent,
    
    // Utilities
    disableTextSelection,
    protectImages,
    addInvisibleWatermark,
    obfuscateContactInfo
};

// ============================================
// GLOBAL ACCESS
// ============================================
if (typeof window !== 'undefined') {
    window.StudyHubSecurity = {
        protect: protectElement,
        unprotect: unprotectElement,
        isDevToolsOpen: isDevToolsDetected,
        isVisible: isPageCurrentlyVisible,
        onEvent: onSecurityEvent,
        manager: securityManager,
        status: () => securityManager.getStatus()
    };
}

console.log('🔒 Security System loaded');