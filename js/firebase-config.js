/**
 * ============================================
 * STUDY HUB - Firebase Configuration
 * ============================================
 * This file initializes Firebase and exports
 * all necessary services for the application.
 * ============================================
 */

// Firebase SDK v9+ Modular Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { 
    getFirestore,
    collection,
    doc,
    setDoc,
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
    arrayUnion,
    arrayRemove,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { 
    getStorage,
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ============================================
// Firebase Configuration
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyCH4RrGuj2YOmShCDrbJMwb2IaxgLxq0UE",
    authDomain: "studyhub-chat.firebaseapp.com",
    projectId: "studyhub-chat",
    storageBucket: "studyhub-chat.firebasestorage.app",
    messagingSenderId: "293952006372",
    appId: "1:293952006372:web:a3519a93a616896eaee4f1"
};

// ============================================
// Initialize Firebase
// ============================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ============================================
// Collection References
// ============================================
const COLLECTIONS = {
    USERS: 'users',
    MESSAGES: 'messages',
    ARCHIVED_MESSAGES: 'archivedMessages',
    NOTIFICATIONS: 'notifications',
    ADMIN_LOGS: 'adminLogs',
    FILTER_LOGS: 'filterLogs'
};

// ============================================
// Default Avatars Based on Gender
// ============================================
const DEFAULT_AVATARS = {
    male: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzRBOTBEMiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE4IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTUwIDU1YzIwIDAgMzAgMTUgMzAgMzB2MTVIMjBWODVjMC0xNSAxMC0zMCAzMC0zMHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=',
    female: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI0VDNDA3QSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE4IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTUwIDU1YzIwIDAgMzAgMTUgMzAgMzB2MTVIMjBWODVjMC0xNSAxMC0zMCAzMC0zMHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=',
    other: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzlDMjdCMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE4IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTUwIDU1YzIwIDAgMzAgMTUgMzAgMzB2MTVIMjBWODVjMC0xNSAxMC0zMCAzMC0zMHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4='
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get current timestamp from server
 */
const getServerTimestamp = () => serverTimestamp();

/**
 * Convert Firestore timestamp to readable date
 */
const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Format time ago
 */
const timeAgo = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return formatTimestamp(timestamp);
};

/**
 * Generate unique ID
 */
const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// ============================================
// Export Everything
// ============================================
export {
    // Firebase instances
    app,
    auth,
    db,
    storage,
    
    // Auth functions
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    
    // Firestore functions
    collection,
    doc,
    setDoc,
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
    arrayUnion,
    arrayRemove,
    writeBatch,
    Timestamp,
    
    // Storage functions
    ref,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    
    // Constants
    COLLECTIONS,
    DEFAULT_AVATARS,
    
    // Helper functions
    getServerTimestamp,
    formatTimestamp,
    timeAgo,
    generateId
};

// ============================================
// Console Log for Debug
// ============================================
console.log('🔥 Firebase initialized successfully!');
console.log('📦 Project:', firebaseConfig.projectId);