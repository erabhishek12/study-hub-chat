/**
 * ============================================
 * STUDY HUB - Authentication System
 * ============================================
 * Part 1: Core Authentication & Registration
 * 
 * Features:
 * - User registration with validation
 * - Profile picture upload & crop
 * - Username uniqueness check
 * - Default avatar generation
 * ============================================
 */

import {
    auth,
    db,
    storage,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    collection,
    query,
    where,
    serverTimestamp,
    ref,
    uploadBytes,
    getDownloadURL,
    DEFAULT_AVATARS,
    COLLECTIONS
} from './firebase-config.js';

// ============================================
// VALIDATION PATTERNS & RULES
// ============================================
const VALIDATION = {
    email: {
        pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        message: 'Please enter a valid email address'
    },
    password: {
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
        message: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'
    },
    username: {
        pattern: /^[a-zA-Z0-9_]{3,20}$/,
        message: 'Username must be 3-20 characters (letters, numbers, underscore only)'
    },
    displayName: {
        pattern: /^[a-zA-Z\s]{2,50}$/,
        message: 'Display name must be 2-50 characters (letters and spaces only)'
    },
    mobile: {
        pattern: /^[6-9]\d{9}$/,
        message: 'Please enter a valid 10-digit mobile number'
    }
};

// Allowed image types and size
const IMAGE_CONFIG = {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
    outputSize: 200 // Output size for cropped image
};

// ============================================
// AUTH ERROR MESSAGES
// ============================================
const AUTH_ERRORS = {
    'auth/email-already-in-use': 'This email is already registered. Please login instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
    'auth/weak-password': 'Password is too weak. Please choose a stronger password.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found with this email. Please register first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'default': 'An error occurred. Please try again.'
};

/**
 * Get user-friendly error message
 * @param {Error} error - Firebase error
 * @returns {string} - User-friendly message
 */
function getAuthErrorMessage(error) {
    const code = error.code || 'default';
    return AUTH_ERRORS[code] || AUTH_ERRORS['default'];
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {Object} - Validation result
 */
function validateEmail(email) {
    if (!email || !email.trim()) {
        return { valid: false, message: 'Email is required' };
    }
    
    if (!VALIDATION.email.pattern.test(email.trim())) {
        return { valid: false, message: VALIDATION.email.message };
    }
    
    return { valid: true, message: '' };
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result
 */
function validatePassword(password) {
    if (!password) {
        return { valid: false, message: 'Password is required' };
    }
    
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters' };
    }
    
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 uppercase letter' };
    }
    
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 lowercase letter' };
    }
    
    if (!/\d/.test(password)) {
        return { valid: false, message: 'Password must contain at least 1 number' };
    }
    
    return { valid: true, message: '' };
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {Object} - Validation result
 */
function validateUsername(username) {
    if (!username || !username.trim()) {
        return { valid: false, message: 'Username is required' };
    }
    
    const trimmed = username.trim();
    
    if (trimmed.length < 3) {
        return { valid: false, message: 'Username must be at least 3 characters' };
    }
    
    if (trimmed.length > 20) {
        return { valid: false, message: 'Username must be at most 20 characters' };
    }
    
    if (!VALIDATION.username.pattern.test(trimmed)) {
        return { valid: false, message: VALIDATION.username.message };
    }
    
    return { valid: true, message: '' };
}

/**
 * Validate display name
 * @param {string} displayName - Display name to validate
 * @returns {Object} - Validation result
 */
function validateDisplayName(displayName) {
    if (!displayName || !displayName.trim()) {
        return { valid: false, message: 'Display name is required' };
    }
    
    const trimmed = displayName.trim();
    
    if (trimmed.length < 2) {
        return { valid: false, message: 'Display name must be at least 2 characters' };
    }
    
    if (trimmed.length > 50) {
        return { valid: false, message: 'Display name must be at most 50 characters' };
    }
    
    return { valid: true, message: '' };
}

/**
 * Validate mobile number
 * @param {string} mobile - Mobile number to validate
 * @returns {Object} - Validation result
 */
function validateMobile(mobile) {
    if (!mobile || !mobile.trim()) {
        return { valid: false, message: 'Mobile number is required' };
    }
    
    // Remove spaces and dashes
    const cleaned = mobile.replace(/[\s-]/g, '');
    
    if (!VALIDATION.mobile.pattern.test(cleaned)) {
        return { valid: false, message: VALIDATION.mobile.message };
    }
    
    return { valid: true, message: '' };
}

/**
 * Validate all registration fields
 * @param {Object} formData - Form data object
 * @returns {Object} - Validation result with all errors
 */
function validateRegistrationForm(formData) {
    const errors = {};
    
    // Email
    const emailResult = validateEmail(formData.email);
    if (!emailResult.valid) errors.email = emailResult.message;
    
    // Password
    const passwordResult = validatePassword(formData.password);
    if (!passwordResult.valid) errors.password = passwordResult.message;
    
    // Confirm password
    if (formData.confirmPassword !== formData.password) {
        errors.confirmPassword = 'Passwords do not match';
    }
    
    // Display name
    const displayNameResult = validateDisplayName(formData.displayName);
    if (!displayNameResult.valid) errors.displayName = displayNameResult.message;
    
    // Username
    const usernameResult = validateUsername(formData.username);
    if (!usernameResult.valid) errors.username = usernameResult.message;
    
    // Gender
    if (!formData.gender || !['male', 'female', 'other'].includes(formData.gender)) {
        errors.gender = 'Please select a gender';
    }
    
    // Mobile
    const mobileResult = validateMobile(formData.mobile);
    if (!mobileResult.valid) errors.mobile = mobileResult.message;
    
    // Terms
    if (!formData.acceptTerms) {
        errors.terms = 'You must accept the terms and conditions';
    }
    
    return {
        valid: Object.keys(errors).length === 0,
        errors: errors
    };
}

// ============================================
// USERNAME UNIQUENESS CHECK
// ============================================

/**
 * Check if username is already taken
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} - True if available, false if taken
 */
async function isUsernameAvailable(username) {
    try {
        const usernameQuery = query(
            collection(db, COLLECTIONS.USERS),
            where('username', '==', username.toLowerCase().trim())
        );
        
        const snapshot = await getDocs(usernameQuery);
        return snapshot.empty;
    } catch (error) {
        console.error('Error checking username:', error);
        throw new Error('Unable to verify username availability');
    }
}

// ============================================
// IMAGE PROCESSING
// ============================================

/**
 * Validate image file
 * @param {File} file - Image file
 * @returns {Object} - Validation result
 */
function validateImageFile(file) {
    if (!file) {
        return { valid: true, message: '' }; // Image is optional
    }
    
    if (!IMAGE_CONFIG.allowedTypes.includes(file.type)) {
        return { 
            valid: false, 
            message: 'Please upload a JPG, PNG, or WebP image' 
        };
    }
    
    if (file.size > IMAGE_CONFIG.maxSize) {
        return { 
            valid: false, 
            message: 'Image must be less than 2MB' 
        };
    }
    
    return { valid: true, message: '' };
}

/**
 * Crop image to square and resize
 * @param {File} file - Image file
 * @param {number} size - Output size
 * @returns {Promise<Blob>} - Cropped image blob
 */
async function cropImageToSquare(file, size = IMAGE_CONFIG.outputSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate crop dimensions (center crop)
                const minDimension = Math.min(img.width, img.height);
                const sx = (img.width - minDimension) / 2;
                const sy = (img.height - minDimension) / 2;
                
                // Set output size
                canvas.width = size;
                canvas.height = size;
                
                // Draw cropped and resized image
                ctx.drawImage(
                    img,
                    sx, sy, minDimension, minDimension,  // Source rectangle
                    0, 0, size, size                      // Destination rectangle
                );
                
                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image blob'));
                        }
                    },
                    'image/jpeg',
                    0.85 // Quality
                );
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Upload profile picture to Firebase Storage
 * @param {string} userId - User ID
 * @param {File|Blob} imageFile - Image file or blob
 * @returns {Promise<string>} - Download URL
 */
async function uploadProfilePicture(userId, imageFile) {
    try {
        // Create file reference
        const fileName = `profile_${userId}_${Date.now()}.jpg`;
        const storageRef = ref(storage, `profilePictures/${userId}/${fileName}`);
        
        // Upload file
        const snapshot = await uploadBytes(storageRef, imageFile, {
            contentType: 'image/jpeg'
        });
        
        // Get download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return downloadURL;
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        throw new Error('Failed to upload profile picture');
    }
}

/**
 * Get default avatar based on gender
 * @param {string} gender - User's gender
 * @returns {string} - Default avatar URL
 */
function getDefaultAvatar(gender) {
    switch (gender) {
        case 'male':
            return DEFAULT_AVATARS.male;
        case 'female':
            return DEFAULT_AVATARS.female;
        case 'other':
        default:
            return DEFAULT_AVATARS.other;
    }
}

// ============================================
// USER REGISTRATION
// ============================================

/**
 * Register a new user
 * @param {Object} formData - Registration form data
 * @param {File|null} profileImage - Profile image file (optional)
 * @returns {Promise<Object>} - Result with user data or error
 */
async function registerUser(formData, profileImage = null) {
    try {
        // Step 1: Validate form data
        const validation = validateRegistrationForm(formData);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }
        
        // Step 2: Validate image if provided
        if (profileImage) {
            const imageValidation = validateImageFile(profileImage);
            if (!imageValidation.valid) {
                return {
                    success: false,
                    errors: { profileImage: imageValidation.message }
                };
            }
        }
        
        // Step 3: Check username availability
        const usernameAvailable = await isUsernameAvailable(formData.username);
        if (!usernameAvailable) {
            return {
                success: false,
                errors: { username: 'This username is already taken' }
            };
        }
        
        // Step 4: Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            formData.email.trim(),
            formData.password
        );
        
        const user = userCredential.user;
        
        // Step 5: Process and upload profile picture
        let photoURL;
        
        if (profileImage) {
            // Crop and upload image
            const croppedImage = await cropImageToSquare(profileImage);
            photoURL = await uploadProfilePicture(user.uid, croppedImage);
        } else {
            // Use default avatar based on gender
            photoURL = getDefaultAvatar(formData.gender);
        }
        
        // Step 6: Update Firebase Auth profile
        await updateProfile(user, {
            displayName: formData.displayName.trim(),
            photoURL: photoURL
        });
        
        // Step 7: Create user document in Firestore
        const userData = {
            uid: user.uid,
            email: formData.email.trim().toLowerCase(),
            displayName: formData.displayName.trim(),
            username: formData.username.trim().toLowerCase(),
            gender: formData.gender,
            photoURL: photoURL,
            mobile: formData.mobile.replace(/[\s-]/g, ''),
            role: 'user',
            status: 'active',
            mutedUntil: null,
            banReason: null,
            warningCount: 0,
            totalMessages: 0,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp()
        };
        
        await setDoc(doc(db, COLLECTIONS.USERS, user.uid), userData);
        
        console.log('✅ User registered successfully:', user.uid);
        
        return {
            success: true,
            user: user,
            userData: userData
        };
        
    } catch (error) {
        console.error('Registration error:', error);
        
        return {
            success: false,
            error: getAuthErrorMessage(error)
        };
    }
}

// ============================================
// IMAGE PREVIEW UTILITY
// ============================================

/**
 * Create preview of selected image
 * @param {File} file - Image file
 * @returns {Promise<string>} - Data URL for preview
 */
function createImagePreview(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            resolve(e.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
    });
}

// ============================================
// REGISTRATION FORM HANDLER
// ============================================

/**
 * Initialize registration form
 * @param {string} formId - Form element ID
 */
function initRegistrationForm(formId = 'registrationForm') {
    const form = document.getElementById(formId);
    if (!form) return;
    
    // Profile image preview
    const imageInput = form.querySelector('#profileImage');
    const imagePreview = form.querySelector('#imagePreview');
    const removeImageBtn = form.querySelector('#removeImage');
    
    if (imageInput && imagePreview) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            
            if (file) {
                // Validate
                const validation = validateImageFile(file);
                if (!validation.valid) {
                    showFormError('profileImage', validation.message);
                    imageInput.value = '';
                    return;
                }
                
                // Show preview
                try {
                    const previewUrl = await createImagePreview(file);
                    imagePreview.innerHTML = `
                        <img src="${previewUrl}" alt="Preview" class="preview-img">
                        <button type="button" class="image-preview-remove" id="removeImage">×</button>
                    `;
                    imagePreview.classList.add('has-image');
                    
                    // Add remove handler
                    document.getElementById('removeImage')?.addEventListener('click', () => {
                        imageInput.value = '';
                        imagePreview.innerHTML = '';
                        imagePreview.classList.remove('has-image');
                    });
                } catch (error) {
                    console.error('Preview error:', error);
                }
            }
        });
    }
    
    // Username availability check
    const usernameInput = form.querySelector('#username');
    let usernameTimeout;
    
    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            clearTimeout(usernameTimeout);
            
            const username = e.target.value.trim();
            
            // Clear previous status
            clearFieldStatus('username');
            
            if (username.length < 3) return;
            
            // Debounce the check
            usernameTimeout = setTimeout(async () => {
                const validation = validateUsername(username);
                
                if (!validation.valid) {
                    showFieldError('username', validation.message);
                    return;
                }
                
                // Show checking status
                showFieldStatus('username', 'Checking availability...', 'info');
                
                try {
                    const available = await isUsernameAvailable(username);
                    
                    if (available) {
                        showFieldStatus('username', 'Username is available', 'success');
                    } else {
                        showFieldError('username', 'Username is already taken');
                    }
                } catch (error) {
                    showFieldError('username', 'Unable to check availability');
                }
            }, 500);
        });
    }
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Clear previous errors
        clearAllErrors(form);
        
        // Get form data
        const formData = {
            email: form.querySelector('#email')?.value,
            password: form.querySelector('#password')?.value,
            confirmPassword: form.querySelector('#confirmPassword')?.value,
            displayName: form.querySelector('#displayName')?.value,
            username: form.querySelector('#username')?.value,
            gender: form.querySelector('input[name="gender"]:checked')?.value,
            mobile: form.querySelector('#mobile')?.value,
            acceptTerms: form.querySelector('#acceptTerms')?.checked
        };
        
        const profileImage = form.querySelector('#profileImage')?.files[0] || null;
        
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Creating Account...';
        }
        
        try {
            const result = await registerUser(formData, profileImage);
            
            if (result.success) {
                // Show success and redirect
                showToast('Account created successfully!', 'success');
                
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                // Show errors
                if (result.errors) {
                    Object.entries(result.errors).forEach(([field, message]) => {
                        showFieldError(field, message);
                    });
                }
                
                if (result.error) {
                    showToast(result.error, 'error');
                }
                
                // Reset button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        } catch (error) {
            console.error('Form submission error:', error);
            showToast('An unexpected error occurred', 'error');
            
            // Reset button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
    
    // Real-time validation
    setupRealTimeValidation(form);
}

/**
 * Setup real-time validation for form fields
 * @param {HTMLFormElement} form - Form element
 */
function setupRealTimeValidation(form) {
    // Email
    const emailInput = form.querySelector('#email');
    if (emailInput) {
        emailInput.addEventListener('blur', () => {
            const result = validateEmail(emailInput.value);
            if (!result.valid) {
                showFieldError('email', result.message);
            } else {
                clearFieldError('email');
            }
        });
    }
    
    // Password
    const passwordInput = form.querySelector('#password');
    if (passwordInput) {
        passwordInput.addEventListener('blur', () => {
            const result = validatePassword(passwordInput.value);
            if (!result.valid) {
                showFieldError('password', result.message);
            } else {
                clearFieldError('password');
            }
        });
        
        // Password strength indicator
        passwordInput.addEventListener('input', () => {
            updatePasswordStrength(passwordInput.value);
        });
    }
    
    // Confirm password
    const confirmInput = form.querySelector('#confirmPassword');
    if (confirmInput && passwordInput) {
        confirmInput.addEventListener('blur', () => {
            if (confirmInput.value !== passwordInput.value) {
                showFieldError('confirmPassword', 'Passwords do not match');
            } else {
                clearFieldError('confirmPassword');
            }
        });
    }
    
    // Mobile
    const mobileInput = form.querySelector('#mobile');
    if (mobileInput) {
        mobileInput.addEventListener('blur', () => {
            const result = validateMobile(mobileInput.value);
            if (!result.valid) {
                showFieldError('mobile', result.message);
            } else {
                clearFieldError('mobile');
            }
        });
        
        // Format mobile number as user types
        mobileInput.addEventListener('input', (e) => {
            // Remove non-digits
            let value = e.target.value.replace(/\D/g, '');
            // Limit to 10 digits
            value = value.substring(0, 10);
            e.target.value = value;
        });
    }
}

/**
 * Update password strength indicator
 * @param {string} password - Password value
 */
function updatePasswordStrength(password) {
    const strengthBar = document.querySelector('.password-strength-bar');
    const strengthText = document.querySelector('.password-strength-text');
    
    if (!strengthBar) return;
    
    let strength = 0;
    let label = '';
    let color = '';
    
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) {
        label = 'Weak';
        color = 'var(--error)';
    } else if (strength <= 4) {
        label = 'Medium';
        color = 'var(--warning)';
    } else {
        label = 'Strong';
        color = 'var(--success)';
    }
    
    const percentage = (strength / 6) * 100;
    strengthBar.style.width = `${percentage}%`;
    strengthBar.style.backgroundColor = color;
    
    if (strengthText) {
        strengthText.textContent = label;
        strengthText.style.color = color;
    }
}

// ============================================
// FORM ERROR HANDLING UTILITIES
// ============================================

/**
 * Show error for a specific field
 * @param {string} fieldId - Field ID
 * @param {string} message - Error message
 */
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.classList.add('error');
    field.classList.remove('success');
    
    // Find or create error element
    let errorEl = field.parentElement.querySelector('.form-error');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'form-error';
        field.parentElement.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
    errorEl.style.display = 'flex';
}

/**
 * Clear error for a specific field
 * @param {string} fieldId - Field ID
 */
function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.classList.remove('error');
    
    const errorEl = field.parentElement.querySelector('.form-error');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

/**
 * Show status for a field (info, success, etc.)
 * @param {string} fieldId - Field ID
 * @param {string} message - Status message
 * @param {string} type - Status type (info, success, error)
 */
function showFieldStatus(fieldId, message, type = 'info') {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    if (type === 'success') {
        field.classList.add('success');
        field.classList.remove('error');
    } else if (type === 'error') {
        field.classList.add('error');
        field.classList.remove('success');
    }
    
    let statusEl = field.parentElement.querySelector('.field-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'field-status';
        field.parentElement.appendChild(statusEl);
    }
    
    statusEl.textContent = message;
    statusEl.className = `field-status ${type}`;
    statusEl.style.display = 'block';
}

/**
 * Clear field status
 * @param {string} fieldId - Field ID
 */
function clearFieldStatus(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.classList.remove('success', 'error');
    
    const statusEl = field.parentElement.querySelector('.field-status');
    if (statusEl) {
        statusEl.style.display = 'none';
    }
}

/**
 * Clear all errors in a form
 * @param {HTMLFormElement} form - Form element
 */
function clearAllErrors(form) {
    form.querySelectorAll('.form-error').forEach(el => {
        el.style.display = 'none';
    });
    
    form.querySelectorAll('.error').forEach(el => {
        el.classList.remove('error');
    });
    
    form.querySelectorAll('.field-status').forEach(el => {
        el.style.display = 'none';
    });
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Toast type (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    // Create toast container if not exists
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ============================================
// EXPORTS FOR PART 1
// ============================================
export {
    // Validation functions
    validateEmail,
    validatePassword,
    validateUsername,
    validateDisplayName,
    validateMobile,
    validateRegistrationForm,
    validateImageFile,
    
    // Username check
    isUsernameAvailable,
    
    // Image processing
    cropImageToSquare,
    uploadProfilePicture,
    getDefaultAvatar,
    createImagePreview,
    
    // Registration
    registerUser,
    initRegistrationForm,
    
    // Error handling
    getAuthErrorMessage,
    showFieldError,
    clearFieldError,
    showFieldStatus,
    clearFieldStatus,
    clearAllErrors,
    showToast,
    
    // Validation patterns
    VALIDATION,
    IMAGE_CONFIG,
    AUTH_ERRORS
};

console.log('🔐 Auth System (Part 1) - Registration module loaded');
/**
 * ============================================
 * STUDY HUB - Authentication System
 * ============================================
 * Part 2: Login, Session & Profile Management
 * 
 * Features:
 * - User login with remember me
 * - Password reset
 * - Session management
 * - Profile updates
 * - Auth state observer
 * ============================================
 */

import {
    auth,
    db,
    storage,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    COLLECTIONS
} from './firebase-config.js';

import {
    validateEmail,
    validatePassword,
    getAuthErrorMessage,
    showFieldError,
    clearFieldError,
    clearAllErrors,
    showToast,
    cropImageToSquare,
    validateImageFile,
    getDefaultAvatar
} from './auth.js';

// ============================================
// SESSION CONFIGURATION
// ============================================
const SESSION_CONFIG = {
    INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    ACTIVITY_CHECK_INTERVAL: 60 * 1000,  // Check every minute
    REMEMBER_ME_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
    SESSION_STORAGE_KEY: 'studyhub_session',
    REMEMBER_ME_KEY: 'studyhub_remember'
};

// Track user activity
let lastActivityTime = Date.now();
let activityCheckInterval = null;
let currentUser = null;
let currentUserData = null;

// ============================================
// USER LOGIN
// ============================================

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {boolean} rememberMe - Remember me option
 * @returns {Promise<Object>} - Login result
 */
async function loginUser(email, password, rememberMe = false) {
    try {
        // Validate inputs
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return {
                success: false,
                errors: { email: emailValidation.message }
            };
        }
        
        if (!password) {
            return {
                success: false,
                errors: { password: 'Password is required' }
            };
        }
        
        // Sign in with Firebase
        const userCredential = await signInWithEmailAndPassword(
            auth,
            email.trim(),
            password
        );
        
        const user = userCredential.user;
        
        // Get user data from Firestore
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
        
        if (!userDoc.exists()) {
            // User exists in Auth but not in Firestore - unusual case
            await signOut(auth);
            return {
                success: false,
                error: 'Account data not found. Please contact support.'
            };
        }
        
        const userData = userDoc.data();
        
        // Check if user is banned
        if (userData.status === 'banned') {
            await signOut(auth);
            return {
                success: false,
                error: `Your account has been banned. Reason: ${userData.banReason || 'Violation of community guidelines'}`
            };
        }
        
        // Update last active time
        await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
            lastActive: serverTimestamp()
        });
        
        // Handle remember me
        if (rememberMe) {
            localStorage.setItem(SESSION_CONFIG.REMEMBER_ME_KEY, 'true');
            localStorage.setItem(SESSION_CONFIG.SESSION_STORAGE_KEY, JSON.stringify({
                uid: user.uid,
                email: user.email,
                timestamp: Date.now()
            }));
        } else {
            localStorage.removeItem(SESSION_CONFIG.REMEMBER_ME_KEY);
            sessionStorage.setItem(SESSION_CONFIG.SESSION_STORAGE_KEY, JSON.stringify({
                uid: user.uid,
                email: user.email,
                timestamp: Date.now()
            }));
        }
        
        // Start activity tracking
        startActivityTracking();
        
        console.log('✅ User logged in:', user.uid);
        
        return {
            success: true,
            user: user,
            userData: userData,
            isAdmin: userData.role === 'admin'
        };
        
    } catch (error) {
        console.error('Login error:', error);
        
        return {
            success: false,
            error: getAuthErrorMessage(error)
        };
    }
}

/**
 * Initialize login form
 * @param {string} formId - Form element ID
 */
function initLoginForm(formId = 'loginForm') {
    const form = document.getElementById(formId);
    if (!form) return;
    
    // Toggle password visibility
    const togglePasswordBtn = form.querySelector('.toggle-password');
    const passwordInput = form.querySelector('#password');
    
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            togglePasswordBtn.innerHTML = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Clear previous errors
        clearAllErrors(form);
        
        // Get form data
        const email = form.querySelector('#email')?.value;
        const password = form.querySelector('#password')?.value;
        const rememberMe = form.querySelector('#rememberMe')?.checked || false;
        
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn?.innerHTML;
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Signing In...';
        }
        
        try {
            const result = await loginUser(email, password, rememberMe);
            
            if (result.success) {
                showToast('Login successful!', 'success');
                
                // Redirect based on role
                setTimeout(() => {
                    if (result.isAdmin) {
                        window.location.href = 'admin-panel.html';
                    } else {
                        window.location.href = 'index.html';
                    }
                }, 1000);
            } else {
                // Show errors
                if (result.errors) {
                    Object.entries(result.errors).forEach(([field, message]) => {
                        showFieldError(field, message);
                    });
                }
                
                if (result.error) {
                    showToast(result.error, 'error');
                }
                
                // Reset button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        } catch (error) {
            console.error('Login form error:', error);
            showToast('An unexpected error occurred', 'error');
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
    
    // Forgot password link
    const forgotPasswordLink = form.querySelector('.forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }
}

// ============================================
// PASSWORD RESET
// ============================================

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<Object>} - Result
 */
async function sendPasswordReset(email) {
    try {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return {
                success: false,
                error: emailValidation.message
            };
        }
        
        await sendPasswordResetEmail(auth, email.trim());
        
        return {
            success: true,
            message: 'Password reset email sent! Check your inbox.'
        };
        
    } catch (error) {
        console.error('Password reset error:', error);
        
        // Don't reveal if email exists or not for security
        if (error.code === 'auth/user-not-found') {
            return {
                success: true,
                message: 'If an account exists with this email, a reset link has been sent.'
            };
        }
        
        return {
            success: false,
            error: getAuthErrorMessage(error)
        };
    }
}

/**
 * Show forgot password modal
 */
function showForgotPasswordModal() {
    // Remove existing modal
    document.querySelector('.forgot-password-modal')?.remove();
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active forgot-password-modal';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Reset Password</h3>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body">
                <p class="text-secondary mb-lg">
                    Enter your email address and we'll send you a link to reset your password.
                </p>
                <form id="forgotPasswordForm">
                    <div class="form-group">
                        <label class="form-label" for="resetEmail">Email Address</label>
                        <input 
                            type="email" 
                            id="resetEmail" 
                            class="neu-input" 
                            placeholder="Enter your email"
                            required
                        >
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="neu-button" id="cancelResetBtn">Cancel</button>
                <button type="submit" form="forgotPasswordForm" class="neu-button neu-button-primary" id="sendResetBtn">
                    Send Reset Link
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus email input
    setTimeout(() => {
        modal.querySelector('#resetEmail')?.focus();
    }, 100);
    
    // Close handlers
    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };
    
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#cancelResetBtn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Form submission
    const form = modal.querySelector('#forgotPasswordForm');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = modal.querySelector('#resetEmail')?.value;
        const submitBtn = modal.querySelector('#sendResetBtn');
        const originalText = submitBtn?.innerHTML;
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Sending...';
        }
        
        const result = await sendPasswordReset(email);
        
        if (result.success) {
            showToast(result.message, 'success');
            closeModal();
        } else {
            showToast(result.error, 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// ============================================
// USER LOGOUT
// ============================================

/**
 * Logout current user
 * @returns {Promise<Object>} - Logout result
 */
async function logoutUser() {
    try {
        // Stop activity tracking
        stopActivityTracking();
        
        // Clear session storage
        localStorage.removeItem(SESSION_CONFIG.SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_CONFIG.REMEMBER_ME_KEY);
        sessionStorage.removeItem(SESSION_CONFIG.SESSION_STORAGE_KEY);
        
        // Sign out from Firebase
        await signOut(auth);
        
        // Clear current user data
        currentUser = null;
        currentUserData = null;
        
        console.log('✅ User logged out');
        
        return { success: true };
        
    } catch (error) {
        console.error('Logout error:', error);
        return {
            success: false,
            error: 'Failed to logout. Please try again.'
        };
    }
}

/**
 * Initialize logout button
 * @param {string} buttonSelector - Button selector
 */
function initLogoutButton(buttonSelector = '.logout-btn') {
    const buttons = document.querySelectorAll(buttonSelector);
    
    buttons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Confirm logout
            if (confirm('Are you sure you want to logout?')) {
                const result = await logoutUser();
                
                if (result.success) {
                    showToast('Logged out successfully', 'success');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 500);
                } else {
                    showToast(result.error, 'error');
                }
            }
        });
    });
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Start tracking user activity
 */
function startActivityTracking() {
    // Update last activity on user interactions
    const updateActivity = () => {
        lastActivityTime = Date.now();
    };
    
    // Listen for user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, updateActivity, { passive: true });
    });
    
    // Check for inactivity periodically
    activityCheckInterval = setInterval(() => {
        checkInactivity();
    }, SESSION_CONFIG.ACTIVITY_CHECK_INTERVAL);
    
    // Update last active in Firestore periodically
    setInterval(() => {
        updateLastActive();
    }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Stop activity tracking
 */
function stopActivityTracking() {
    if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
        activityCheckInterval = null;
    }
}

/**
 * Check for user inactivity
 */
function checkInactivity() {
    const rememberMe = localStorage.getItem(SESSION_CONFIG.REMEMBER_ME_KEY) === 'true';
    
    // Skip inactivity check if remember me is enabled
    if (rememberMe) return;
    
    const inactiveTime = Date.now() - lastActivityTime;
    
    if (inactiveTime >= SESSION_CONFIG.INACTIVITY_TIMEOUT) {
        console.log('⏰ Session timeout due to inactivity');
        handleSessionTimeout();
    } else if (inactiveTime >= SESSION_CONFIG.INACTIVITY_TIMEOUT - 60000) {
        // Warn 1 minute before timeout
        showSessionWarning();
    }
}

/**
 * Handle session timeout
 */
async function handleSessionTimeout() {
    showToast('Session expired due to inactivity', 'warning');
    
    await logoutUser();
    
    setTimeout(() => {
        window.location.href = 'login.html?reason=timeout';
    }, 1500);
}

/**
 * Show session timeout warning
 */
function showSessionWarning() {
    // Check if warning already shown
    if (document.querySelector('.session-warning')) return;
    
    const warning = document.createElement('div');
    warning.className = 'session-warning alert alert-warning';
    warning.innerHTML = `
        <span class="alert-icon">⏰</span>
        <span class="alert-content">
            Your session will expire in 1 minute due to inactivity.
            <button class="neu-button neu-button-sm" id="extendSessionBtn">Stay Logged In</button>
        </span>
    `;
    
    warning.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        animation: slideInUp 0.3s ease;
    `;
    
    document.body.appendChild(warning);
    
    // Extend session button
    warning.querySelector('#extendSessionBtn')?.addEventListener('click', () => {
        lastActivityTime = Date.now();
        warning.remove();
        showToast('Session extended', 'success');
    });
    
    // Auto remove after 30 seconds
    setTimeout(() => warning.remove(), 30000);
}

/**
 * Update user's last active timestamp
 */
async function updateLastActive() {
    if (!currentUser) return;
    
    try {
        await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), {
            lastActive: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating last active:', error);
    }
}

// ============================================
// AUTH STATE OBSERVER
// ============================================

/**
 * Initialize auth state observer
 * @param {Object} options - Configuration options
 */
function initAuthObserver(options = {}) {
    const {
        onAuthenticated = null,
        onUnauthenticated = null,
        requireAuth = false,
        requireAdmin = false,
        redirectTo = 'login.html'
    } = options;
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            currentUser = user;
            
            try {
                // Get user data from Firestore
                const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
                
                if (userDoc.exists()) {
                    currentUserData = userDoc.data();
                    
                    // Check if banned
                    if (currentUserData.status === 'banned') {
                        showToast('Your account has been banned', 'error');
                        await logoutUser();
                        window.location.href = 'login.html?reason=banned';
                        return;
                    }
                    
                    // Check admin requirement
                    if (requireAdmin && currentUserData.role !== 'admin') {
                        showToast('Access denied. Admin privileges required.', 'error');
                        window.location.href = 'index.html';
                        return;
                    }
                    
                    // Start activity tracking
                    startActivityTracking();
                    
                    // Update UI
                    updateAuthUI(true);
                    
                    // Callback
                    if (onAuthenticated) {
                        onAuthenticated(user, currentUserData);
                    }
                } else {
                    // User data not found
                    console.error('User data not found in Firestore');
                    await logoutUser();
                    window.location.href = 'login.html?reason=data_not_found';
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        } else {
            // User is signed out
            currentUser = null;
            currentUserData = null;
            
            stopActivityTracking();
            
            // Update UI
            updateAuthUI(false);
            
            // Redirect if auth is required
            if (requireAuth) {
                window.location.href = redirectTo;
                return;
            }
            
            // Callback
            if (onUnauthenticated) {
                onUnauthenticated();
            }
        }
    });
}

/**
 * Update UI based on auth state
 * @param {boolean} isAuthenticated - Whether user is authenticated
 */
function updateAuthUI(isAuthenticated) {
    // Update header user info
    const userMenus = document.querySelectorAll('.user-menu, .header-user');
    const authLinks = document.querySelectorAll('.auth-link');
    
    if (isAuthenticated && currentUserData) {
        // Show user menus
        userMenus.forEach(menu => {
            menu.style.display = 'flex';
            
            // Update avatar
            const avatar = menu.querySelector('.user-menu-avatar, .header-avatar');
            if (avatar) {
                avatar.src = currentUserData.photoURL || getDefaultAvatar(currentUserData.gender);
                avatar.alt = currentUserData.displayName;
            }
            
            // Update name
            const name = menu.querySelector('.user-menu-name, .header-username');
            if (name) {
                name.textContent = currentUserData.displayName;
            }
        });
        
        // Hide auth links
        authLinks.forEach(link => {
            link.style.display = 'none';
        });
    } else {
        // Hide user menus
        userMenus.forEach(menu => {
            menu.style.display = 'none';
        });
        
        // Show auth links
        authLinks.forEach(link => {
            link.style.display = 'flex';
        });
    }
}

/**
 * Get current user
 * @returns {Object|null} - Current Firebase user
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Get current user data
 * @returns {Object|null} - Current user data from Firestore
 */
function getCurrentUserData() {
    return currentUserData;
}

/**
 * Refresh current user data from Firestore
 * @returns {Promise<Object|null>} - Updated user data
 */
async function refreshUserData() {
    if (!currentUser) return null;
    
    try {
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, currentUser.uid));
        
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            return currentUserData;
        }
        
        return null;
    } catch (error) {
        console.error('Error refreshing user data:', error);
        return null;
    }
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

/**
 * Update user profile
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Update result
 */
async function updateUserProfile(updates) {
    if (!currentUser) {
        return { success: false, error: 'Not authenticated' };
    }
    
    try {
        const allowedFields = ['displayName'];
        const firestoreUpdates = {};
        const authUpdates = {};
        
        // Filter allowed updates
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value) {
                firestoreUpdates[key] = value.trim();
                
                if (key === 'displayName') {
                    authUpdates.displayName = value.trim();
                }
            }
        }
        
        // Validate display name if provided
        if (firestoreUpdates.displayName) {
            if (firestoreUpdates.displayName.length < 2) {
                return { success: false, error: 'Display name must be at least 2 characters' };
            }
            if (firestoreUpdates.displayName.length > 50) {
                return { success: false, error: 'Display name must be at most 50 characters' };
            }
        }
        
        // Update Firestore
        if (Object.keys(firestoreUpdates).length > 0) {
            firestoreUpdates.updatedAt = serverTimestamp();
            await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), firestoreUpdates);
        }
        
        // Update Firebase Auth
        if (Object.keys(authUpdates).length > 0) {
            await updateProfile(currentUser, authUpdates);
        }
        
        // Refresh user data
        await refreshUserData();
        
        // Update UI
        updateAuthUI(true);
        
        return { success: true };
        
    } catch (error) {
        console.error('Error updating profile:', error);
        return { success: false, error: 'Failed to update profile' };
    }
}

/**
 * Update user profile picture
 * @param {File} imageFile - New profile image
 * @returns {Promise<Object>} - Update result
 */
async function updateProfilePicture(imageFile) {
    if (!currentUser) {
        return { success: false, error: 'Not authenticated' };
    }
    
    try {
        // Validate image
        const validation = validateImageFile(imageFile);
        if (!validation.valid) {
            return { success: false, error: validation.message };
        }
        
        // Crop image
        const croppedImage = await cropImageToSquare(imageFile);
        
        // Upload to storage
        const fileName = `profile_${currentUser.uid}_${Date.now()}.jpg`;
        const storageRef = ref(storage, `profilePictures/${currentUser.uid}/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, croppedImage, {
            contentType: 'image/jpeg'
        });
        
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Update Firestore
        await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), {
            photoURL: downloadURL,
            updatedAt: serverTimestamp()
        });
        
        // Update Firebase Auth
        await updateProfile(currentUser, {
            photoURL: downloadURL
        });
        
        // Refresh user data
        await refreshUserData();
        
        // Update UI
        updateAuthUI(true);
        
        return { success: true, photoURL: downloadURL };
        
    } catch (error) {
        console.error('Error updating profile picture:', error);
        return { success: false, error: 'Failed to update profile picture' };
    }
}

/**
 * Change user password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - Change result
 */
async function changePassword(currentPassword, newPassword) {
    if (!currentUser) {
        return { success: false, error: 'Not authenticated' };
    }
    
    try {
        // Validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            return { success: false, error: passwordValidation.message };
        }
        
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(
            currentUser.email,
            currentPassword
        );
        
        await reauthenticateWithCredential(currentUser, credential);
        
        // Update password
        await updatePassword(currentUser, newPassword);
        
        return { success: true };
        
    } catch (error) {
        console.error('Error changing password:', error);
        
        if (error.code === 'auth/wrong-password') {
            return { success: false, error: 'Current password is incorrect' };
        }
        
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

/**
 * Initialize profile page
 */
function initProfilePage() {
    // Wait for auth state
    initAuthObserver({
        requireAuth: true,
        onAuthenticated: (user, userData) => {
            // Populate profile fields
            populateProfileFields(userData);
            
            // Setup edit handlers
            setupProfileEditHandlers();
        }
    });
}

/**
 * Populate profile page with user data
 * @param {Object} userData - User data
 */
function populateProfileFields(userData) {
    // Avatar
    const avatar = document.querySelector('.profile-avatar');
    if (avatar) {
        avatar.src = userData.photoURL || getDefaultAvatar(userData.gender);
        avatar.classList.add(userData.gender);
    }
    
    // Display name
    const displayName = document.querySelector('#profileDisplayName');
    if (displayName) {
        displayName.value = userData.displayName || '';
    }
    
    // Username (readonly)
    const username = document.querySelector('#profileUsername');
    if (username) {
        username.value = userData.username || '';
    }
    
    // Email (readonly)
    const email = document.querySelector('#profileEmail');
    if (email) {
        email.value = userData.email || '';
    }
    
    // Mobile (readonly)
    const mobile = document.querySelector('#profileMobile');
    if (mobile) {
        mobile.value = userData.mobile || '';
    }
    
    // Gender (readonly)
    const gender = document.querySelector('#profileGender');
    if (gender) {
        gender.value = userData.gender ? 
            userData.gender.charAt(0).toUpperCase() + userData.gender.slice(1) : '';
    }
    
    // Member since
    const createdAt = document.querySelector('#profileCreatedAt');
    if (createdAt && userData.createdAt) {
        const date = userData.createdAt.toDate ? 
            userData.createdAt.toDate() : new Date(userData.createdAt);
        createdAt.value = date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    // Stats
    const totalMessages = document.querySelector('#profileTotalMessages');
    if (totalMessages) {
        totalMessages.textContent = userData.totalMessages || 0;
    }
    
    const warnings = document.querySelector('#profileWarnings');
    if (warnings) {
        warnings.textContent = userData.warningCount || 0;
    }
}

/**
 * Setup profile edit handlers
 */
function setupProfileEditHandlers() {
    // Edit display name
    const editDisplayNameBtn = document.querySelector('#editDisplayNameBtn');
    const displayNameInput = document.querySelector('#profileDisplayName');
    const saveDisplayNameBtn = document.querySelector('#saveDisplayNameBtn');
    
    if (editDisplayNameBtn && displayNameInput) {
        editDisplayNameBtn.addEventListener('click', () => {
            displayNameInput.disabled = false;
            displayNameInput.focus();
            editDisplayNameBtn.style.display = 'none';
            if (saveDisplayNameBtn) saveDisplayNameBtn.style.display = 'flex';
        });
    }
    
    if (saveDisplayNameBtn && displayNameInput) {
        saveDisplayNameBtn.addEventListener('click', async () => {
            const newName = displayNameInput.value.trim();
            
            if (!newName || newName.length < 2) {
                showToast('Display name must be at least 2 characters', 'error');
                return;
            }
            
            saveDisplayNameBtn.disabled = true;
            saveDisplayNameBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span>';
            
            const result = await updateUserProfile({ displayName: newName });
            
            if (result.success) {
                showToast('Display name updated!', 'success');
                displayNameInput.disabled = true;
                saveDisplayNameBtn.style.display = 'none';
                if (editDisplayNameBtn) editDisplayNameBtn.style.display = 'flex';
            } else {
                showToast(result.error, 'error');
            }
            
            saveDisplayNameBtn.disabled = false;
            saveDisplayNameBtn.innerHTML = 'Save';
        });
    }
    
    // Change profile picture
    const changePhotoBtn = document.querySelector('#changePhotoBtn');
    const photoInput = document.querySelector('#profilePhotoInput');
    
    if (changePhotoBtn && photoInput) {
        changePhotoBtn.addEventListener('click', () => {
            photoInput.click();
        });
        
        photoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            changePhotoBtn.disabled = true;
            changePhotoBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Uploading...';
            
            const result = await updateProfilePicture(file);
            
            if (result.success) {
                showToast('Profile picture updated!', 'success');
                
                // Update avatar on page
                const avatar = document.querySelector('.profile-avatar');
                if (avatar) {
                    avatar.src = result.photoURL;
                }
            } else {
                showToast(result.error, 'error');
            }
            
            changePhotoBtn.disabled = false;
            changePhotoBtn.innerHTML = '📷 Change Photo';
            photoInput.value = '';
        });
    }
    
    // Change password
    const changePasswordBtn = document.querySelector('#changePasswordBtn');
    
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            showChangePasswordModal();
        });
    }
}

/**
 * Show change password modal
 */
function showChangePasswordModal() {
    // Remove existing modal
    document.querySelector('.change-password-modal')?.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active change-password-modal';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Change Password</h3>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body">
                <form id="changePasswordForm">
                    <div class="form-group">
                        <label class="form-label" for="currentPassword">Current Password</label>
                        <input 
                            type="password" 
                            id="currentPassword" 
                            class="neu-input" 
                            placeholder="Enter current password"
                            required
                        >
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="newPassword">New Password</label>
                        <input 
                            type="password" 
                            id="newPassword" 
                            class="neu-input" 
                            placeholder="Enter new password"
                            required
                        >
                        <div class="form-help">
                            Min 8 characters, 1 uppercase, 1 lowercase, 1 number
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="confirmNewPassword">Confirm New Password</label>
                        <input 
                            type="password" 
                            id="confirmNewPassword" 
                            class="neu-input" 
                            placeholder="Confirm new password"
                            required
                        >
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="neu-button" id="cancelPasswordBtn">Cancel</button>
                <button type="submit" form="changePasswordForm" class="neu-button neu-button-primary" id="savePasswordBtn">
                    Change Password
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close handlers
    const closeModal = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    };
    
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#cancelPasswordBtn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Form submission
    const form = modal.querySelector('#changePasswordForm');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = modal.querySelector('#currentPassword')?.value;
        const newPassword = modal.querySelector('#newPassword')?.value;
        const confirmNewPassword = modal.querySelector('#confirmNewPassword')?.value;
        
        // Validate
        if (newPassword !== confirmNewPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }
        
        const submitBtn = modal.querySelector('#savePasswordBtn');
        const originalText = submitBtn?.innerHTML;
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Changing...';
        }
        
        const result = await changePassword(currentPassword, newPassword);
        
        if (result.success) {
            showToast('Password changed successfully!', 'success');
            closeModal();
        } else {
            showToast(result.error, 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    });
}

// ============================================
// CHECK SPECIFIC ROLES
// ============================================

/**
 * Check if current user is admin
 * @returns {boolean}
 */
function isAdmin() {
    return currentUserData?.role === 'admin';
}

/**
 * Check if current user is muted
 * @returns {boolean}
 */
function isMuted() {
    if (!currentUserData?.mutedUntil) return false;
    
    const mutedUntil = currentUserData.mutedUntil.toDate ? 
        currentUserData.mutedUntil.toDate() : 
        new Date(currentUserData.mutedUntil);
    
    return mutedUntil > new Date();
}

/**
 * Check if current user is banned
 * @returns {boolean}
 */
function isBanned() {
    return currentUserData?.status === 'banned';
}

/**
 * Get mute remaining time
 * @returns {Date|null}
 */
function getMuteEndTime() {
    if (!currentUserData?.mutedUntil) return null;
    
    return currentUserData.mutedUntil.toDate ? 
        currentUserData.mutedUntil.toDate() : 
        new Date(currentUserData.mutedUntil);
}

// ============================================
// EXPORTS FOR PART 2
// ============================================
export {
    // Login & Logout
    loginUser,
    logoutUser,
    initLoginForm,
    initLogoutButton,
    
    // Password reset
    sendPasswordReset,
    showForgotPasswordModal,
    
    // Session management
    startActivityTracking,
    stopActivityTracking,
    handleSessionTimeout,
    SESSION_CONFIG,
    
    // Auth observer
    initAuthObserver,
    updateAuthUI,
    
    // User getters
    getCurrentUser,
    getCurrentUserData,
    refreshUserData,
    
    // Profile management
    updateUserProfile,
    updateProfilePicture,
    changePassword,
    initProfilePage,
    populateProfileFields,
    showChangePasswordModal,
    
    // Role checks
    isAdmin,
    isMuted,
    isBanned,
    getMuteEndTime
};

console.log('🔐 Auth System (Part 2) - Login & Session module loaded');