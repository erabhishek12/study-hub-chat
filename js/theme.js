/**
 * ============================================
 * STUDY HUB - Theme Toggle System
 * ============================================
 * Features:
 * - Light/Dark theme toggle
 * - System preference detection
 * - LocalStorage persistence
 * - Smooth transitions
 * - Multiple toggle buttons support
 * ============================================
 */

// ============================================
// THEME CONFIGURATION
// ============================================
const THEME_CONFIG = {
    STORAGE_KEY: 'studyhub_theme',
    LIGHT: 'light',
    DARK: 'dark',
    TRANSITION_DURATION: 300 // milliseconds
};

// Theme icons
const THEME_ICONS = {
    light: {
        icon: '🌙',
        label: 'Switch to Dark Mode',
        emoji: '☀️'
    },
    dark: {
        icon: '☀️',
        label: 'Switch to Light Mode',
        emoji: '🌙'
    }
};

// ============================================
// THEME MANAGER CLASS
// ============================================
class ThemeManager {
    constructor() {
        this.currentTheme = null;
        this.toggleButtons = [];
        this.listeners = [];
        
        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Initialize theme manager
     */
    init() {
        // Get saved theme or detect system preference
        const savedTheme = this.getSavedTheme();
        const systemTheme = this.getSystemTheme();
        
        // Priority: saved > system > light
        this.currentTheme = savedTheme || systemTheme || THEME_CONFIG.LIGHT;
        
        // Apply theme immediately (without transition for initial load)
        this.applyTheme(this.currentTheme, false);
        
        // Setup toggle buttons
        this.setupToggleButtons();
        
        // Listen for system theme changes
        this.watchSystemTheme();
        
        console.log(`🎨 Theme initialized: ${this.currentTheme}`);
    }
    
    /**
     * Get saved theme from localStorage
     * @returns {string|null}
     */
    getSavedTheme() {
        try {
            return localStorage.getItem(THEME_CONFIG.STORAGE_KEY);
        } catch (e) {
            console.warn('Unable to access localStorage:', e);
            return null;
        }
    }
    
    /**
     * Save theme to localStorage
     * @param {string} theme - Theme name
     */
    saveTheme(theme) {
        try {
            localStorage.setItem(THEME_CONFIG.STORAGE_KEY, theme);
        } catch (e) {
            console.warn('Unable to save theme:', e);
        }
    }
    
    /**
     * Get system color scheme preference
     * @returns {string}
     */
    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEME_CONFIG.DARK;
        }
        return THEME_CONFIG.LIGHT;
    }
    
    /**
     * Watch for system theme changes
     */
    watchSystemTheme() {
        if (!window.matchMedia) return;
        
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        const handleChange = (e) => {
            // Only auto-switch if no saved preference
            if (!this.getSavedTheme()) {
                const newTheme = e.matches ? THEME_CONFIG.DARK : THEME_CONFIG.LIGHT;
                this.applyTheme(newTheme);
                console.log(`🎨 System theme changed to: ${newTheme}`);
            }
        };
        
        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else {
            // Older browsers
            mediaQuery.addListener(handleChange);
        }
    }
    
    /**
     * Apply theme to document
     * @param {string} theme - Theme to apply
     * @param {boolean} animate - Whether to animate transition
     */
    applyTheme(theme, animate = true) {
        const html = document.documentElement;
        const body = document.body;
        
        // Validate theme
        if (theme !== THEME_CONFIG.LIGHT && theme !== THEME_CONFIG.DARK) {
            theme = THEME_CONFIG.LIGHT;
        }
        
        // Add transition class for smooth change
        if (animate) {
            html.classList.add('theme-transitioning');
            body.classList.add('theme-transitioning');
        }
        
        // Set theme attribute
        html.setAttribute('data-theme', theme);
        
        // Update meta theme-color for mobile browsers
        this.updateMetaThemeColor(theme);
        
        // Update toggle buttons
        this.updateToggleButtons(theme);
        
        // Store current theme
        this.currentTheme = theme;
        
        // Notify listeners
        this.notifyListeners(theme);
        
        // Remove transition class after animation
        if (animate) {
            setTimeout(() => {
                html.classList.remove('theme-transitioning');
                body.classList.remove('theme-transitioning');
            }, THEME_CONFIG.TRANSITION_DURATION);
        }
    }
    
    /**
     * Toggle between light and dark theme
     * @returns {string} - New theme
     */
    toggle() {
        const newTheme = this.currentTheme === THEME_CONFIG.LIGHT 
            ? THEME_CONFIG.DARK 
            : THEME_CONFIG.LIGHT;
        
        this.applyTheme(newTheme);
        this.saveTheme(newTheme);
        
        console.log(`🎨 Theme toggled to: ${newTheme}`);
        
        return newTheme;
    }
    
    /**
     * Set specific theme
     * @param {string} theme - Theme to set
     */
    setTheme(theme) {
        if (theme !== this.currentTheme) {
            this.applyTheme(theme);
            this.saveTheme(theme);
        }
    }
    
    /**
     * Get current theme
     * @returns {string}
     */
    getTheme() {
        return this.currentTheme;
    }
    
    /**
     * Check if dark mode is active
     * @returns {boolean}
     */
    isDarkMode() {
        return this.currentTheme === THEME_CONFIG.DARK;
    }
    
    /**
     * Update meta theme-color for mobile browsers
     * @param {string} theme - Current theme
     */
    updateMetaThemeColor(theme) {
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        
        // Set color based on theme
        const color = theme === THEME_CONFIG.DARK ? '#1a1a2e' : '#e0e5ec';
        metaThemeColor.content = color;
    }
    
    /**
     * Setup all toggle buttons on the page
     */
    setupToggleButtons() {
        // Find all toggle buttons
        const buttons = document.querySelectorAll(
            '.theme-toggle, [data-theme-toggle], #themeToggle'
        );
        
        buttons.forEach(button => {
            // Store reference
            this.toggleButtons.push(button);
            
            // Add click handler
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggle();
                
                // Add ripple effect
                this.createRipple(button, e);
            });
            
            // Set initial state
            this.updateButtonState(button, this.currentTheme);
            
            // Add keyboard support
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggle();
                }
            });
            
            // Ensure button is focusable
            if (!button.hasAttribute('tabindex')) {
                button.setAttribute('tabindex', '0');
            }
            
            // Add aria attributes
            button.setAttribute('role', 'button');
            this.updateButtonAria(button, this.currentTheme);
        });
    }
    
    /**
     * Update all toggle buttons
     * @param {string} theme - Current theme
     */
    updateToggleButtons(theme) {
        this.toggleButtons.forEach(button => {
            this.updateButtonState(button, theme);
            this.updateButtonAria(button, theme);
        });
    }
    
    /**
     * Update single button state
     * @param {HTMLElement} button - Button element
     * @param {string} theme - Current theme
     */
    updateButtonState(button, theme) {
        const icons = THEME_ICONS[theme];
        
        // Find icon elements
        const sunIcon = button.querySelector('.icon-sun, .sun-icon, [data-icon="sun"]');
        const moonIcon = button.querySelector('.icon-moon, .moon-icon, [data-icon="moon"]');
        
        if (sunIcon && moonIcon) {
            // Toggle icon visibility
            if (theme === THEME_CONFIG.DARK) {
                sunIcon.style.display = 'block';
                moonIcon.style.display = 'none';
            } else {
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'block';
            }
        } else {
            // Simple text/emoji button
            const iconSpan = button.querySelector('.theme-icon');
            if (iconSpan) {
                iconSpan.textContent = icons.icon;
            } else if (button.dataset.themeToggle !== undefined) {
                // For data attribute buttons
                button.textContent = icons.icon;
            }
        }
        
        // Update button classes
        button.classList.remove('theme-light', 'theme-dark');
        button.classList.add(`theme-${theme}`);
    }
    
    /**
     * Update button ARIA attributes
     * @param {HTMLElement} button - Button element
     * @param {string} theme - Current theme
     */
    updateButtonAria(button, theme) {
        const nextTheme = theme === THEME_CONFIG.LIGHT ? THEME_CONFIG.DARK : THEME_CONFIG.LIGHT;
        const label = THEME_ICONS[theme].label;
        
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', theme === THEME_CONFIG.DARK);
        button.setAttribute('title', label);
    }
    
    /**
     * Create ripple effect on button click
     * @param {HTMLElement} button - Button element
     * @param {MouseEvent} event - Click event
     */
    createRipple(button, event) {
        // Remove existing ripples
        const existingRipple = button.querySelector('.theme-ripple');
        if (existingRipple) {
            existingRipple.remove();
        }
        
        // Create ripple element
        const ripple = document.createElement('span');
        ripple.className = 'theme-ripple';
        
        // Calculate position
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: currentColor;
            border-radius: 50%;
            transform: scale(0);
            opacity: 0.3;
            animation: themeRipple 0.6s ease-out;
            pointer-events: none;
        `;
        
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => ripple.remove(), 600);
    }
    
    /**
     * Add theme change listener
     * @param {Function} callback - Callback function
     * @returns {Function} - Unsubscribe function
     */
    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
            
            // Return unsubscribe function
            return () => {
                this.listeners = this.listeners.filter(cb => cb !== callback);
            };
        }
        return () => {};
    }
    
    /**
     * Notify all listeners of theme change
     * @param {string} theme - New theme
     */
    notifyListeners(theme) {
        this.listeners.forEach(callback => {
            try {
                callback(theme, this.isDarkMode());
            } catch (e) {
                console.error('Theme listener error:', e);
            }
        });
    }
    
    /**
     * Reset theme to system preference
     */
    resetToSystem() {
        try {
            localStorage.removeItem(THEME_CONFIG.STORAGE_KEY);
        } catch (e) {
            // Ignore
        }
        
        const systemTheme = this.getSystemTheme();
        this.applyTheme(systemTheme);
        
        console.log(`🎨 Theme reset to system: ${systemTheme}`);
    }
}

// ============================================
// ADD THEME TRANSITION STYLES
// ============================================
function injectThemeStyles() {
    // Check if styles already exist
    if (document.getElementById('theme-transition-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'theme-transition-styles';
    style.textContent = `
        /* Theme Transition */
        .theme-transitioning,
        .theme-transitioning *,
        .theme-transitioning *::before,
        .theme-transitioning *::after {
            transition: background-color 0.3s ease,
                        color 0.3s ease,
                        border-color 0.3s ease,
                        box-shadow 0.3s ease,
                        fill 0.3s ease,
                        stroke 0.3s ease !important;
        }
        
        /* Theme Toggle Button Animations */
        .theme-toggle {
            position: relative;
            overflow: hidden;
        }
        
        .theme-toggle .icon-sun,
        .theme-toggle .icon-moon {
            transition: transform 0.3s ease, opacity 0.3s ease;
        }
        
        [data-theme="dark"] .theme-toggle .icon-sun {
            transform: rotate(0deg);
        }
        
        [data-theme="light"] .theme-toggle .icon-moon {
            transform: rotate(0deg);
        }
        
        /* Ripple Animation */
        @keyframes themeRipple {
            to {
                transform: scale(2.5);
                opacity: 0;
            }
        }
        
        /* Theme Toggle Icon Container */
        .theme-icon-container {
            position: relative;
            width: 24px;
            height: 24px;
        }
        
        .theme-icon-container .icon-sun,
        .theme-icon-container .icon-moon {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
        
        /* Sun/Moon Icon Animation */
        .theme-toggle.animating .icon-sun {
            animation: sunRise 0.5s ease forwards;
        }
        
        .theme-toggle.animating .icon-moon {
            animation: moonRise 0.5s ease forwards;
        }
        
        @keyframes sunRise {
            0% {
                transform: translate(-50%, 100%) rotate(-180deg);
                opacity: 0;
            }
            100% {
                transform: translate(-50%, -50%) rotate(0deg);
                opacity: 1;
            }
        }
        
        @keyframes moonRise {
            0% {
                transform: translate(-50%, 100%) rotate(180deg);
                opacity: 0;
            }
            100% {
                transform: translate(-50%, -50%) rotate(0deg);
                opacity: 1;
            }
        }
        
        /* Prevent flash of wrong theme */
        html:not([data-theme]) {
            visibility: hidden;
        }
        
        html[data-theme] {
            visibility: visible;
        }
    `;
    
    document.head.appendChild(style);
}

// ============================================
// CREATE THEME TOGGLE BUTTON HTML
// ============================================

/**
 * Create a theme toggle button
 * @param {Object} options - Button options
 * @returns {HTMLElement} - Button element
 */
function createThemeToggleButton(options = {}) {
    const {
        className = 'theme-toggle',
        size = 'md', // sm, md, lg
        style = 'icon', // icon, text, both
        container = null
    } = options;
    
    const button = document.createElement('button');
    button.className = `${className} neu-icon-button`;
    button.type = 'button';
    button.setAttribute('aria-label', 'Toggle theme');
    
    // Size classes
    if (size === 'sm') button.classList.add('neu-icon-button-sm');
    if (size === 'lg') button.classList.add('neu-icon-button-lg');
    
    // Inner content based on style
    if (style === 'icon' || style === 'both') {
        button.innerHTML = `
            <span class="theme-icon-container">
                <span class="icon-sun" style="display: none;">☀️</span>
                <span class="icon-moon">🌙</span>
            </span>
            ${style === 'both' ? '<span class="theme-text">Theme</span>' : ''}
        `;
    } else {
        button.innerHTML = '<span class="theme-text">Toggle Theme</span>';
    }
    
    // Append to container if provided
    if (container) {
        if (typeof container === 'string') {
            document.querySelector(container)?.appendChild(button);
        } else {
            container.appendChild(button);
        }
    }
    
    return button;
}

// ============================================
// QUICK THEME UTILITIES
// ============================================

/**
 * Get CSS variable value based on current theme
 * @param {string} varName - CSS variable name (without --)
 * @returns {string} - Variable value
 */
function getThemeVariable(varName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(`--${varName}`)
        .trim();
}

/**
 * Set CSS variable value
 * @param {string} varName - CSS variable name (without --)
 * @param {string} value - Value to set
 */
function setThemeVariable(varName, value) {
    document.documentElement.style.setProperty(`--${varName}`, value);
}

/**
 * Apply custom theme colors
 * @param {Object} colors - Color overrides
 */
function applyCustomColors(colors) {
    Object.entries(colors).forEach(([name, value]) => {
        setThemeVariable(name, value);
    });
}

// ============================================
// INITIALIZATION
// ============================================

// Inject styles immediately
injectThemeStyles();

// Create singleton instance
const themeManager = new ThemeManager();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Toggle theme (shortcut)
 */
function toggleTheme() {
    return themeManager.toggle();
}

/**
 * Set theme (shortcut)
 * @param {string} theme - Theme name
 */
function setTheme(theme) {
    themeManager.setTheme(theme);
}

/**
 * Get current theme (shortcut)
 * @returns {string}
 */
function getTheme() {
    return themeManager.getTheme();
}

/**
 * Check if dark mode (shortcut)
 * @returns {boolean}
 */
function isDarkMode() {
    return themeManager.isDarkMode();
}

/**
 * Add theme change listener (shortcut)
 * @param {Function} callback - Callback function
 * @returns {Function} - Unsubscribe function
 */
function onThemeChange(callback) {
    return themeManager.addListener(callback);
}

// ============================================
// EXPORTS
// ============================================
export {
    // Theme Manager
    ThemeManager,
    themeManager,
    
    // Configuration
    THEME_CONFIG,
    THEME_ICONS,
    
    // Convenience functions
    toggleTheme,
    setTheme,
    getTheme,
    isDarkMode,
    onThemeChange,
    
    // Utilities
    createThemeToggleButton,
    getThemeVariable,
    setThemeVariable,
    applyCustomColors,
    injectThemeStyles
};

// ============================================
// AUTO-INITIALIZE ON SCRIPT LOAD
// ============================================

// Make available globally for non-module usage
if (typeof window !== 'undefined') {
    window.StudyHubTheme = {
        toggle: toggleTheme,
        set: setTheme,
        get: getTheme,
        isDark: isDarkMode,
        onChange: onThemeChange,
        manager: themeManager
    };
}

console.log('🎨 Theme System loaded');
