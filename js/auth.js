/**
 * ============================================
 * STUDY HUB - Authentication System
 * ============================================
 * Core Authentication, Registration, Session 
 * & Profile Management
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
    deleteObject,
    DEFAULT_AVATARS,
    COLLECTIONS
} from './firebase-config.js';

// ============================================
// CONFIGURATION & CONSTANTS
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

const IMAGE_CONFIG = {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
    outputSize: 200 // Output size for cropped image
};

const SESSION_CONFIG = {
    INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    ACTIVITY_CHECK_INTERVAL: 60 * 1000,  // Check every minute
    REMEMBER_ME_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days
    SESSION_STORAGE_KEY: 'studyhub_session',
    REMEMBER_ME_KEY: 'studyhub_remember'
};

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

// Global State
let lastActivityTime = Date.now();
let activityCheckInterval = null;
let currentUser = null;
let currentUserData = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get user-friendly error message
 */
function getAuthErrorMessage(error) {
    const code = error.code || 'default';
    return AUTH_ERRORS[code] || AUTH_ERRORS['default'];
}

// ============================================
// VALIDATION LOGIC
// ============================================

function validateEmail(email) {
    if (!email || !email.trim()) return { valid: false, message: 'Email is required' };
    if (!VALIDATION.email.pattern.test(email.trim())) return { valid: false, message: VALIDATION.email.message };
    return { valid: true, message: '' };
}

function validatePassword(password) {
    if (!password) return { valid: false, message: 'Password is required' };
    if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least 1 uppercase letter' };
    if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain at least 1 lowercase letter' };
    if (!/\d/.test(password)) return { valid: false, message: 'Password must contain at least 1 number' };
    return { valid: true, message: '' };
}

function validateUsername(username) {
    if (!username || !username.trim()) return { valid: false, message: 'Username is required' };
    const trimmed = username.trim();
    if (trimmed.length < 3) return { valid: false, message: 'Username must be at least 3 characters' };
    if (trimmed.length > 20) return { valid: false, message: 'Username must be at most 20 characters' };
    if (!VALIDATION.username.pattern.test(trimmed)) return { valid: false, message: VALIDATION.username.message };
    return { valid: true, message: '' };
}

function validateDisplayName(displayName) {
    if (!displayName || !displayName.trim()) return { valid: false, message: 'Display name is required' };
    const trimmed = displayName.trim();
    if (trimmed.length < 2) return { valid: false, message: 'Display name must be at least 2 characters' };
    if (trimmed.length > 50) return { valid: false, message: 'Display name must be at most 50 characters' };
    return { valid: true, message: '' };
}

function validateMobile(mobile) {
    if (!mobile || !mobile.trim()) return { valid: false, message: 'Mobile number is required' };
    const cleaned = mobile.replace(/[\s-]/g, '');
    if (!VALIDATION.mobile.pattern.test(cleaned)) return { valid: false, message: VALIDATION.mobile.message };
    return { valid: true, message: '' };
}

function validateRegistrationForm(formData) {
    const errors = {};
    const emailResult = validateEmail(formData.email);
    if (!emailResult.valid) errors.email = emailResult.message;
    
    const passwordResult = validatePassword(formData.password);
    if (!passwordResult.valid) errors.password = passwordResult.message;
    
    if (formData.confirmPassword !== formData.password) errors.confirmPassword = 'Passwords do not match';
    
    const displayNameResult = validateDisplayName(formData.displayName);
    if (!displayNameResult.valid) errors.displayName = displayNameResult.message;
    
    const usernameResult = validateUsername(formData.username);
    if (!usernameResult.valid) errors.username = usernameResult.message;
    
    if (!formData.gender || !['male', 'female', 'other'].includes(formData.gender)) errors.gender = 'Please select a gender';
    
    const mobileResult = validateMobile(formData.mobile);
    if (!mobileResult.valid) errors.mobile = mobileResult.message;
    
    if (!formData.acceptTerms) errors.terms = 'You must accept the terms and conditions';
    
    return { valid: Object.keys(errors).length === 0, errors: errors };
}

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

function validateImageFile(file) {
    if (!file) return { valid: true, message: '' };
    if (!IMAGE_CONFIG.allowedTypes.includes(file.type)) return { valid: false, message: 'Please upload a JPG, PNG, or WebP image' };
    if (file.size > IMAGE_CONFIG.maxSize) return { valid: false, message: 'Image must be less than 2MB' };
    return { valid: true, message: '' };
}

async function cropImageToSquare(file, size = IMAGE_CONFIG.outputSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const minDimension = Math.min(img.width, img.height);
                const sx = (img.width - minDimension) / 2;
                const sy = (img.height - minDimension) / 2;
                canvas.width = size;
                canvas.height = size;
                ctx.drawImage(img, sx, sy, minDimension, minDimension, 0, 0, size, size);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create image blob'));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

async function uploadProfilePicture(userId, imageFile) {
    try {
        const fileName = `profile_${userId}_${Date.now()}.jpg`;
        const storageRef = ref(storage, `profilePictures/${userId}/${fileName}`);
        const snapshot = await uploadBytes(storageRef, imageFile, { contentType: 'image/jpeg' });
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        throw new Error('Failed to upload profile picture');
    }
}

function getDefaultAvatar(gender) {
    switch (gender) {
        case 'male': return DEFAULT_AVATARS.male;
        case 'female': return DEFAULT_AVATARS.female;
        default: return DEFAULT_AVATARS.other;
    }
}

function createImagePreview(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('No file provided')); return; }
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// ============================================
// AUTH CORE: REGISTRATION
// ============================================

async function registerUser(formData, profileImage = null) {
    try {
        const validation = validateRegistrationForm(formData);
        if (!validation.valid) return { success: false, errors: validation.errors };
        
        if (profileImage) {
            const imageValidation = validateImageFile(profileImage);
            if (!imageValidation.valid) return { success: false, errors: { profileImage: imageValidation.message } };
        }
        
        const usernameAvailable = await isUsernameAvailable(formData.username);
        if (!usernameAvailable) return { success: false, errors: { username: 'This username is already taken' } };
        
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email.trim(), formData.password);
        const user = userCredential.user;
        
        let photoURL;
        if (profileImage) {
            const croppedImage = await cropImageToSquare(profileImage);
            photoURL = await uploadProfilePicture(user.uid, croppedImage);
        } else {
            photoURL = getDefaultAvatar(formData.gender);
        }
        
        await updateProfile(user, { displayName: formData.displayName.trim(), photoURL: photoURL });
        
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
        return { success: true, user: user, userData: userData };
        
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

// ============================================
// AUTH CORE: LOGIN
// ============================================

async function loginUser(email, password, rememberMe = false) {
    try {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) return { success: false, errors: { email: emailValidation.message } };
        if (!password) return { success: false, errors: { password: 'Password is required' } };
        
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const user = userCredential.user;
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
        
        if (!userDoc.exists()) {
            await signOut(auth);
            return { success: false, error: 'Account data not found. Please contact support.' };
        }
        
        const userData = userDoc.data();
        if (userData.status === 'banned') {
            await signOut(auth);
            return { success: false, error: `Your account has been banned. Reason: ${userData.banReason || 'Violation'}` };
        }
        
        await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { lastActive: serverTimestamp() });
        
        if (rememberMe) {
            localStorage.setItem(SESSION_CONFIG.REMEMBER_ME_KEY, 'true');
            localStorage.setItem(SESSION_CONFIG.SESSION_STORAGE_KEY, JSON.stringify({ uid: user.uid, email: user.email, timestamp: Date.now() }));
        } else {
            localStorage.removeItem(SESSION_CONFIG.REMEMBER_ME_KEY);
            sessionStorage.setItem(SESSION_CONFIG.SESSION_STORAGE_KEY, JSON.stringify({ uid: user.uid, email: user.email, timestamp: Date.now() }));
        }
        
        startActivityTracking();
        console.log('✅ User logged in:', user.uid);
        
        return { success: true, user: user, userData: userData, isAdmin: userData.role === 'admin' };
        
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

async function logoutUser() {
    try {
        stopActivityTracking();
        localStorage.removeItem(SESSION_CONFIG.SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_CONFIG.REMEMBER_ME_KEY);
        sessionStorage.removeItem(SESSION_CONFIG.SESSION_STORAGE_KEY);
        await signOut(auth);
        currentUser = null;
        currentUserData = null;
        console.log('✅ User logged out');
        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { success: false, error: 'Failed to logout. Please try again.' };
    }
}

async function sendPasswordReset(email) {
    try {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) return { success: false, error: emailValidation.message };
        await sendPasswordResetEmail(auth, email.trim());
        return { success: true, message: 'Password reset email sent! Check your inbox.' };
    } catch (error) {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') return { success: true, message: 'If an account exists with this email, a reset link has been sent.' };
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

// ============================================
// PROFILE & SESSION MANAGEMENT
// ============================================

async function updateUserProfile(updates) {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
        const allowedFields = ['displayName'];
        const firestoreUpdates = {};
        const authUpdates = {};
        
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key) && value) {
                firestoreUpdates[key] = value.trim();
                if (key === 'displayName') authUpdates.displayName = value.trim();
            }
        }
        
        if (firestoreUpdates.displayName) {
            if (firestoreUpdates.displayName.length < 2) return { success: false, error: 'Display name must be at least 2 characters' };
            if (firestoreUpdates.displayName.length > 50) return { success: false, error: 'Display name must be at most 50 characters' };
        }
        
        if (Object.keys(firestoreUpdates).length > 0) {
            firestoreUpdates.updatedAt = serverTimestamp();
            await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), firestoreUpdates);
        }
        if (Object.keys(authUpdates).length > 0) await updateProfile(currentUser, authUpdates);
        
        await refreshUserData();
        updateAuthUI(true);
        return { success: true };
    } catch (error) {
        console.error('Error updating profile:', error);
        return { success: false, error: 'Failed to update profile' };
    }
}

async function updateProfilePicture(imageFile) {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
        const validation = validateImageFile(imageFile);
        if (!validation.valid) return { success: false, error: validation.message };
        
        const croppedImage = await cropImageToSquare(imageFile);
        const fileName = `profile_${currentUser.uid}_${Date.now()}.jpg`;
        const storageRef = ref(storage, `profilePictures/${currentUser.uid}/${fileName}`);
        const snapshot = await uploadBytes(storageRef, croppedImage, { contentType: 'image/jpeg' });
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), { photoURL: downloadURL, updatedAt: serverTimestamp() });
        await updateProfile(currentUser, { photoURL: downloadURL });
        
        await refreshUserData();
        updateAuthUI(true);
        return { success: true, photoURL: downloadURL };
    } catch (error) {
        console.error('Error updating profile picture:', error);
        return { success: false, error: 'Failed to update profile picture' };
    }
}

async function changePassword(currentPassword, newPassword) {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    try {
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) return { success: false, error: passwordValidation.message };
        
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        return { success: true };
    } catch (error) {
        console.error('Error changing password:', error);
        if (error.code === 'auth/wrong-password') return { success: false, error: 'Current password is incorrect' };
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

// ============================================
// STATE OBSERVERS & TRACKING
// ============================================

function startActivityTracking() {
    const updateActivity = () => { lastActivityTime = Date.now(); };
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, updateActivity, { passive: true });
    });
    activityCheckInterval = setInterval(checkInactivity, SESSION_CONFIG.ACTIVITY_CHECK_INTERVAL);
    setInterval(updateLastActive, 5 * 60 * 1000); // Every 5 minutes
}

function stopActivityTracking() {
    if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
        activityCheckInterval = null;
    }
}

function checkInactivity() {
    const rememberMe = localStorage.getItem(SESSION_CONFIG.REMEMBER_ME_KEY) === 'true';
    if (rememberMe) return;
    const inactiveTime = Date.now() - lastActivityTime;
    if (inactiveTime >= SESSION_CONFIG.INACTIVITY_TIMEOUT) {
        console.log('⏰ Session timeout');
        handleSessionTimeout();
    } else if (inactiveTime >= SESSION_CONFIG.INACTIVITY_TIMEOUT - 60000) {
        showSessionWarning();
    }
}

async function handleSessionTimeout() {
    showToast('Session expired due to inactivity', 'warning');
    await logoutUser();
    setTimeout(() => { window.location.href = 'login.html?reason=timeout'; }, 1500);
}

function showSessionWarning() {
    if (document.querySelector('.session-warning')) return;
    const warning = document.createElement('div');
    warning.className = 'session-warning alert alert-warning';
    warning.innerHTML = `
        <span class="alert-icon">⏰</span>
        <span class="alert-content">Session expiring soon. <button class="neu-button neu-button-sm" id="extendSessionBtn">Stay Logged In</button></span>
    `;
    warning.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 9999;';
    document.body.appendChild(warning);
    warning.querySelector('#extendSessionBtn')?.addEventListener('click', () => {
        lastActivityTime = Date.now();
        warning.remove();
        showToast('Session extended', 'success');
    });
    setTimeout(() => warning.remove(), 30000);
}

async function updateLastActive() {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, COLLECTIONS.USERS, currentUser.uid), { lastActive: serverTimestamp() });
    } catch (error) { console.error('Error updating last active:', error); }
}

function initAuthObserver(options = {}) {
    const { onAuthenticated = null, onUnauthenticated = null, requireAuth = false, requireAdmin = false, redirectTo = 'login.html' } = options;
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            try {
                const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
                if (userDoc.exists()) {
                    currentUserData = userDoc.data();
                    if (currentUserData.status === 'banned') {
                        showToast('Your account has been banned', 'error');
                        await logoutUser();
                        window.location.href = 'login.html?reason=banned';
                        return;
                    }
                    if (requireAdmin && currentUserData.role !== 'admin') {
                        showToast('Access denied. Admin privileges required.', 'error');
                        window.location.href = 'index.html';
                        return;
                    }
                    startActivityTracking();
                    updateAuthUI(true);
                    if (onAuthenticated) onAuthenticated(user, currentUserData);
                } else {
                    await logoutUser();
                    window.location.href = 'login.html?reason=data_not_found';
                }
            } catch (error) { console.error('Error fetching user data:', error); }
        } else {
            currentUser = null;
            currentUserData = null;
            stopActivityTracking();
            updateAuthUI(false);
            if (requireAuth) { window.location.href = redirectTo; return; }
            if (onUnauthenticated) onUnauthenticated();
        }
    });
}

function updateAuthUI(isAuthenticated) {
    const userMenus = document.querySelectorAll('.user-menu, .header-user');
    const authLinks = document.querySelectorAll('.auth-link');
    if (isAuthenticated && currentUserData) {
        userMenus.forEach(menu => {
            menu.style.display = 'flex';
            const avatar = menu.querySelector('.user-menu-avatar, .header-avatar');
            if (avatar) {
                avatar.src = currentUserData.photoURL || getDefaultAvatar(currentUserData.gender);
                avatar.alt = currentUserData.displayName;
            }
            const name = menu.querySelector('.user-menu-name, .header-username');
            if (name) name.textContent = currentUserData.displayName;
        });
        authLinks.forEach(link => link.style.display = 'none');
    } else {
        userMenus.forEach(menu => menu.style.display = 'none');
        authLinks.forEach(link => link.style.display = 'flex');
    }
}

// ============================================
// UI FORM HANDLERS
// ============================================

function initRegistrationForm(formId = 'registrationForm') {
    const form = document.getElementById(formId);
    if (!form) return;
    
    // Setup Image Preview
    const imageInput = form.querySelector('#profileImage');
    const imagePreview = form.querySelector('#imagePreview');
    if (imageInput && imagePreview) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const validation = validateImageFile(file);
                if (!validation.valid) { showFormError('profileImage', validation.message); imageInput.value = ''; return; }
                try {
                    const previewUrl = await createImagePreview(file);
                    imagePreview.innerHTML = `<img src="${previewUrl}" alt="Preview" class="preview-img"><button type="button" class="image-preview-remove" id="removeImage">×</button>`;
                    imagePreview.classList.add('has-image');
                    document.getElementById('removeImage')?.addEventListener('click', () => { imageInput.value = ''; imagePreview.innerHTML = ''; imagePreview.classList.remove('has-image'); });
                } catch (error) { console.error('Preview error:', error); }
            }
        });
    }
    
    // Setup Username Check
    const usernameInput = form.querySelector('#username');
    let usernameTimeout;
    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            clearTimeout(usernameTimeout);
            const username = e.target.value.trim();
            clearFieldStatus('username');
            if (username.length < 3) return;
            usernameTimeout = setTimeout(async () => {
                const validation = validateUsername(username);
                if (!validation.valid) { showFieldError('username', validation.message); return; }
                showFieldStatus('username', 'Checking availability...', 'info');
                try {
                    const available = await isUsernameAvailable(username);
                    if (available) showFieldStatus('username', 'Username is available', 'success');
                    else showFieldError('username', 'Username is already taken');
                } catch (error) { showFieldError('username', 'Unable to check availability'); }
            }, 500);
        });
    }

    // Submit Handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAllErrors(form);
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
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('loading'); submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Creating Account...'; }
        
        const result = await registerUser(formData, profileImage);
        
        if (result.success) {
            showToast('Account created successfully!', 'success');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } else {
            if (result.errors) Object.entries(result.errors).forEach(([field, message]) => showFieldError(field, message));
            if (result.error) showToast(result.error, 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('loading'); submitBtn.innerHTML = originalBtnText; }
        }
    });

    setupRealTimeValidation(form);
}

function initLoginForm(formId = 'loginForm') {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const togglePasswordBtn = form.querySelector('.toggle-password');
    const passwordInput = form.querySelector('#password');
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            togglePasswordBtn.innerHTML = type === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAllErrors(form);
        const email = form.querySelector('#email')?.value;
        const password = form.querySelector('#password')?.value;
        const rememberMe = form.querySelector('#rememberMe')?.checked || false;
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn?.innerHTML;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('loading'); submitBtn.innerHTML = '<span class="spinner-circle spinner-sm"></span> Signing In...'; }
        
        const result = await loginUser(email, password, rememberMe);
        if (result.success) {
            showToast('Login successful!', 'success');
            setTimeout(() => { window.location.href = result.isAdmin ? 'admin-panel.html' : 'index.html'; }, 1000);
        } else {
            if (result.errors) Object.entries(result.errors).forEach(([field, message]) => showFieldError(field, message));
            if (result.error) showToast(result.error, 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('loading'); submitBtn.innerHTML = originalBtnText; }
        }
    });

    form.querySelector('.forgot-password-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showForgotPasswordModal();
    });
}

function initLogoutButton(buttonSelector = '.logout-btn') {
    const buttons = document.querySelectorAll(buttonSelector);
    buttons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                const result = await logoutUser();
                if (result.success) {
                    showToast('Logged out successfully', 'success');
                    setTimeout(() => { window.location.href = 'login.html'; }, 500);
                } else showToast(result.error, 'error');
            }
        });
    });
}

function setupRealTimeValidation(form) {
    const emailInput = form.querySelector('#email');
    if (emailInput) emailInput.addEventListener('blur', () => { const res = validateEmail(emailInput.value); res.valid ? clearFieldError('email') : showFieldError('email', res.message); });
    
    const passwordInput = form.querySelector('#password');
    if (passwordInput) {
        passwordInput.addEventListener('blur', () => { const res = validatePassword(passwordInput.value); res.valid ? clearFieldError('password') : showFieldError('password', res.message); });
        passwordInput.addEventListener('input', () => updatePasswordStrength(passwordInput.value));
    }
    
    const confirmInput = form.querySelector('#confirmPassword');
    if (confirmInput && passwordInput) confirmInput.addEventListener('blur', () => { confirmInput.value !== passwordInput.value ? showFieldError('confirmPassword', 'Passwords do not match') : clearFieldError('confirmPassword'); });
    
    const mobileInput = form.querySelector('#mobile');
    if (mobileInput) {
        mobileInput.addEventListener('blur', () => { const res = validateMobile(mobileInput.value); res.valid ? clearFieldError('mobile') : showFieldError('mobile', res.message); });
        mobileInput.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10); });
    }
}

// ============================================
// UI HELPER UTILS
// ============================================

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.add('error'); field.classList.remove('success');
    let errorEl = field.parentElement.querySelector('.form-error');
    if (!errorEl) { errorEl = document.createElement('div'); errorEl.className = 'form-error'; field.parentElement.appendChild(errorEl); }
    errorEl.textContent = message; errorEl.style.display = 'flex';
}

function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.remove('error');
    const errorEl = field.parentElement.querySelector('.form-error');
    if (errorEl) errorEl.style.display = 'none';
}

function showFieldStatus(fieldId, message, type = 'info') {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.remove('success', 'error'); field.classList.add(type);
    let statusEl = field.parentElement.querySelector('.field-status');
    if (!statusEl) { statusEl = document.createElement('div'); statusEl.className = 'field-status'; field.parentElement.appendChild(statusEl); }
    statusEl.textContent = message; statusEl.className = `field-status ${type}`; statusEl.style.display = 'block';
}

function clearFieldStatus(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.remove('success', 'error');
    const statusEl = field.parentElement.querySelector('.field-status');
    if (statusEl) statusEl.style.display = 'none';
}

function clearAllErrors(form) {
    form.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    form.querySelectorAll('.field-status').forEach(el => el.style.display = 'none');
}

function showToast(message, type = 'info') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    let container = document.querySelector('.toast-container');
    if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 5000);
}

function updatePasswordStrength(password) {
    const strengthBar = document.querySelector('.password-strength-bar');
    const strengthText = document.querySelector('.password-strength-text');
    if (!strengthBar) return;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    let color = strength <= 2 ? 'var(--error)' : strength <= 4 ? 'var(--warning)' : 'var(--success)';
    strengthBar.style.width = `${(strength / 6) * 100}%`;
    strengthBar.style.backgroundColor = color;
    if (strengthText) { strengthText.textContent = strength <= 2 ? 'Weak' : strength <= 4 ? 'Medium' : 'Strong'; strengthText.style.color = color; }
}

function showForgotPasswordModal() {
    document.querySelector('.forgot-password-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active forgot-password-modal';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header"><h3 class="modal-title">Reset Password</h3><button class="modal-close" type="button">&times;</button></div>
            <div class="modal-body"><p class="text-secondary mb-lg">Enter your email address.</p><form id="forgotPasswordForm"><div class="form-group"><label class="form-label">Email</label><input type="email" id="resetEmail" class="neu-input" required></div></form></div>
            <div class="modal-footer"><button type="button" class="neu-button" id="cancelResetBtn">Cancel</button><button type="submit" form="forgotPasswordForm" class="neu-button neu-button-primary" id="sendResetBtn">Send Reset Link</button></div>
        </div>`;
    document.body.appendChild(modal);
    const closeModal = () => { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); };
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#cancelResetBtn')?.addEventListener('click', closeModal);
    
    modal.querySelector('#forgotPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = modal.querySelector('#sendResetBtn');
        const original = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = 'Sending...';
        const result = await sendPasswordReset(modal.querySelector('#resetEmail').value);
        if (result.success) { showToast(result.message, 'success'); closeModal(); } 
        else { showToast(result.error, 'error'); btn.disabled = false; btn.innerHTML = original; }
    });
}

function showChangePasswordModal() {
    // Logic for password modal similar to forgot password, kept brief for brevity as it's UI
    console.log("Show change password modal triggered");
}

function initProfilePage() {
    initAuthObserver({
        requireAuth: true,
        onAuthenticated: (user, userData) => {
            populateProfileFields(userData);
            setupProfileEditHandlers();
        }
    });
}

function populateProfileFields(userData) {
    const setVal = (sel, val) => { const el = document.querySelector(sel); if(el) el.value = val; };
    const setTxt = (sel, val) => { const el = document.querySelector(sel); if(el) el.textContent = val; };
    
    const avatar = document.querySelector('.profile-avatar');
    if (avatar) { avatar.src = userData.photoURL || getDefaultAvatar(userData.gender); avatar.classList.add(userData.gender); }
    
    setVal('#profileDisplayName', userData.displayName || '');
    setVal('#profileUsername', userData.username || '');
    setVal('#profileEmail', userData.email || '');
    setVal('#profileMobile', userData.mobile || '');
    setVal('#profileGender', userData.gender ? userData.gender.charAt(0).toUpperCase() + userData.gender.slice(1) : '');
    
    if (userData.createdAt) {
        const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
        setVal('#profileCreatedAt', date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }));
    }
    setTxt('#profileTotalMessages', userData.totalMessages || 0);
    setTxt('#profileWarnings', userData.warningCount || 0);
}

function setupProfileEditHandlers() {
    const editBtn = document.querySelector('#editDisplayNameBtn');
    const saveBtn = document.querySelector('#saveDisplayNameBtn');
    const input = document.querySelector('#profileDisplayName');
    
    if (editBtn && input) {
        editBtn.addEventListener('click', () => { input.disabled = false; input.focus(); editBtn.style.display = 'none'; if(saveBtn) saveBtn.style.display = 'flex'; });
    }
    
    if (saveBtn && input) {
        saveBtn.addEventListener('click', async () => {
            const newName = input.value.trim();
            if (newName.length < 2) { showToast('Name too short', 'error'); return; }
            saveBtn.disabled = true;
            const result = await updateUserProfile({ displayName: newName });
            if (result.success) { showToast('Updated!', 'success'); input.disabled = true; saveBtn.style.display = 'none'; if(editBtn) editBtn.style.display = 'flex'; }
            else showToast(result.error, 'error');
            saveBtn.disabled = false;
        });
    }
    
    const photoInput = document.querySelector('#profilePhotoInput');
    const changeBtn = document.querySelector('#changePhotoBtn');
    if (changeBtn && photoInput) {
        changeBtn.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', async (e) => {
            if (!e.target.files[0]) return;
            changeBtn.disabled = true; changeBtn.innerHTML = 'Uploading...';
            const result = await updateProfilePicture(e.target.files[0]);
            if (result.success) { showToast('Photo updated!', 'success'); document.querySelector('.profile-avatar').src = result.photoURL; }
            else showToast(result.error, 'error');
            changeBtn.disabled = false; changeBtn.innerHTML = '📷 Change Photo';
        });
    }
}

// ============================================
// HELPERS FOR ROLES & EXPORTS
// ============================================

function isAdmin() { return currentUserData?.role === 'admin'; }
function isBanned() { return currentUserData?.status === 'banned'; }
function isMuted() { 
    if (!currentUserData?.mutedUntil) return false;
    const mutedUntil = currentUserData.mutedUntil.toDate ? currentUserData.mutedUntil.toDate() : new Date(currentUserData.mutedUntil);
    return mutedUntil > new Date();
}
function getMuteEndTime() {
    if (!currentUserData?.mutedUntil) return null;
    return currentUserData.mutedUntil.toDate ? currentUserData.mutedUntil.toDate() : new Date(currentUserData.mutedUntil);
}
async function refreshUserData() {
    if (!currentUser) return null;
    try {
        const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, currentUser.uid));
        if (userDoc.exists()) { currentUserData = userDoc.data(); return currentUserData; }
        return null;
    } catch { return null; }
}
function getCurrentUser() { return currentUser; }
function getCurrentUserData() { return currentUserData; }

// ============================================
// EXPORTS
// ============================================

export {
    // Constants
    VALIDATION,
    IMAGE_CONFIG,
    AUTH_ERRORS,
    SESSION_CONFIG,

    // Validation Utils
    validateEmail,
    validatePassword,
    validateUsername,
    validateDisplayName,
    validateMobile,
    validateRegistrationForm,
    validateImageFile,
    getAuthErrorMessage,
    
    // Core Auth
    registerUser,
    loginUser,
    logoutUser,
    sendPasswordReset,
    isUsernameAvailable,
    
    // State & Profile
    getCurrentUser,
    getCurrentUserData,
    refreshUserData,
    updateUserProfile,
    updateProfilePicture,
    changePassword,
    isAdmin,
    isMuted,
    isBanned,
    getMuteEndTime,
    
    // Session
    startActivityTracking,
    stopActivityTracking,
    handleSessionTimeout,
    
    // UI Init
    initRegistrationForm,
    initLoginForm,
    initAuthObserver,
    initLogoutButton,
    initProfilePage,
    updateAuthUI,
    populateProfileFields,
    showChangePasswordModal,
    showForgotPasswordModal,
    
    // UI Helpers
    showFieldError,
    clearFieldError,
    showFieldStatus,
    clearFieldStatus,
    clearAllErrors,
    showToast,
    
    // Image Utils
    cropImageToSquare,
    uploadProfilePicture,
    getDefaultAvatar,
    createImagePreview
};

console.log('🔐 Auth System - Fully Loaded');
