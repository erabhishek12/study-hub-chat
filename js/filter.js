/**
 * ============================================
 * STUDY HUB - Content Filtering System
 * ============================================
 * Part 1: Word Lists & Utility Functions
 * 
 * Features:
 * - Abusive words detection (English + Hindi)
 * - Leetspeak normalization
 * - Spam detection
 * - Contact/Number blocking
 * - Social media handle detection
 * ============================================
 */

// ============================================
// CONFIGURATION
// ============================================
const FILTER_CONFIG = {
    // Warning thresholds
    WARNINGS_FOR_1HR_MUTE: 3,
    WARNINGS_FOR_24HR_MUTE: 5,
    WARNINGS_FOR_PERMANENT_BAN: 10,
    
    // Spam detection
    MAX_MESSAGES_PER_MINUTE: 3,
    MAX_MESSAGES_PER_5_MINUTES: 10,
    MIN_MESSAGE_LENGTH: 2,
    DUPLICATE_MESSAGE_WINDOW: 60000, // 1 minute
    
    // Contact detection
    CONTACT_WARNINGS_FOR_24HR_MUTE: 2,
    CONTACT_WARNINGS_FOR_BAN: 3,
    
    // Cooldown between messages (milliseconds)
    MESSAGE_COOLDOWN: 5000, // 5 seconds
    
    // Max message length
    MAX_MESSAGE_LENGTH: 500
};

// ============================================
// ENGLISH ABUSIVE WORDS LIST (100+)
// ============================================
const ENGLISH_BAD_WORDS = [
    // Common profanity
    'fuck', 'fucking', 'fucked', 'fucker', 'fucks', 'fuckin',
    'shit', 'shits', 'shitty', 'shitting', 'bullshit',
    'ass', 'asses', 'asshole', 'assholes', 'arsehole',
    'bitch', 'bitches', 'bitchy', 'bitching',
    'bastard', 'bastards',
    'damn', 'damned', 'dammit', 'goddamn',
    'hell', 'hells',
    'crap', 'crappy',
    'piss', 'pissed', 'pissing',
    'dick', 'dicks', 'dickhead', 'dickheads',
    'cock', 'cocks', 'cocksucker',
    'pussy', 'pussies',
    'cunt', 'cunts',
    'whore', 'whores',
    'slut', 'sluts', 'slutty',
    'fag', 'fags', 'faggot', 'faggots',
    'retard', 'retarded', 'retards',
    'idiot', 'idiots', 'idiotic',
    'stupid', 'stupids',
    'dumb', 'dumbass', 'dumbasses',
    'moron', 'morons', 'moronic',
    'jerk', 'jerks',
    'loser', 'losers',
    'sucker', 'suckers',
    'scum', 'scumbag', 'scumbags',
    'trash', 'trashy',
    'pervert', 'perverts', 'pervy',
    'douche', 'douchebag', 'douchebags',
    'wanker', 'wankers',
    'twat', 'twats',
    'prick', 'pricks',
    'arse', 'arses',
    'bugger', 'buggers',
    'bollocks',
    'bloody',
    'sod', 'sodding',
    'git', 'gits',
    'tosser', 'tossers',
    'bellend',
    'minger',
    'knob', 'knobhead',
    'nonce',
    'pillock',
    'plonker',
    'numpty',
    'muppet',
    'spastic',
    'negro', 'negros',
    'nigga', 'niggas', 'nigger', 'niggers',
    'chink', 'chinks',
    'spic', 'spics',
    'kike', 'kikes',
    'wetback',
    'beaner',
    'cracker', 'crackers',
    'honky',
    'gringo',
    'gook',
    'jap', 'japs',
    'paki', 'pakis',
    'raghead',
    'towelhead',
    'camel jockey',
    'sand nigger',
    'nazi', 'nazis',
    'porn', 'porno', 'pornography',
    'sex', 'sexual', 'sexy',
    'nude', 'nudes', 'naked',
    'boob', 'boobs', 'boobies',
    'tit', 'tits', 'titty', 'titties',
    'penis', 'penises',
    'vagina', 'vaginas',
    'dildo', 'dildos',
    'orgasm', 'orgasms',
    'masturbate', 'masturbating', 'masturbation',
    'rape', 'raping', 'rapist',
    'molest', 'molester', 'molesting',
    'pedophile', 'pedophiles', 'pedo', 'pedos',
    'incest',
    'bestiality',
    'necrophilia',
    'kill', 'killing', 'killer',
    'murder', 'murderer', 'murdering',
    'die', 'dying', 'death',
    'suicide', 'suicidal',
    'terrorist', 'terrorism',
    'bomb', 'bombing',
    'shoot', 'shooting', 'shooter',
    'drug', 'drugs', 'druggie',
    'cocaine', 'heroin', 'meth', 'weed', 'marijuana'
];

// ============================================
// HINDI ABUSIVE WORDS (English Script) - 100+
// ============================================
const HINDI_BAD_WORDS = [
    // Common Hindi profanity
    'madarchod', 'madarchodh', 'mc', 'maaderchod',
    'behenchod', 'behenchod', 'bc', 'bhnchod', 'bhenchod',
    'chutiya', 'chutiye', 'chutia', 'chutiye', 'chu',
    'bhosdike', 'bhosdika', 'bhosdi', 'bsdk', 'bhosadike',
    'gaand', 'gand', 'gaandu', 'gandu', 'gandu',
    'lund', 'loda', 'lauda', 'lawda', 'lavda', 'lode',
    'chut', 'choot',
    'randi', 'randia', 'randa', 'randwa', 'randwe',
    'harami', 'haramkhor', 'haraamzada', 'haramzada',
    'kamina', 'kamine', 'kamini', 'kameena', 'kameene',
    'saala', 'saale', 'sala', 'sale', 'saali',
    'kutte', 'kutta', 'kutiya', 'kutia', 'kutti',
    'gadha', 'gadhe', 'gadhi',
    'ullu', 'ulluka',
    'bewakoof', 'bewkoof', 'bevakoof', 'bewda',
    'pagal', 'paagal', 'pagla', 'pagli',
    'jhant', 'jhaat', 'jhaant', 'jhaatu',
    'tatti', 'tati', 'tatti', 'potty',
    'suwar', 'suar', 'suwwar',
    'hijra', 'hijda', 'chakka',
    'bhikhari', 'bhikari',
    'nalayak', 'naalayak',
    'nikamma', 'nikammi', 'nikamme',
    'ghatiya', 'ghatia',
    'bakwas', 'bakwaas',
    'bakchod', 'bakchodi',
    'chodu', 'chodna', 'chod', 'chuda',
    'maa ki', 'maaki', 'teri maa',
    'behen ki', 'behenki', 'teri behen',
    'baap ka', 'tere baap',
    'laudu', 'laude',
    'bhadwa', 'bhadwe', 'bhadwi',
    'dalla', 'dallal',
    'pataka', 'item',
    'maal', 'mast maal',
    'raand', 'raandwa',
    'chinaal', 'chinal',
    'besharam', 'besharm',
    'badtameez', 'badtameezi',
    'gandu manus',
    'tharki', 'tharak',
    'chirkut', 'chirkoot',
    'chhapri', 'chapri',
    'fattu', 'fatoo',
    'lulli', 'nunnu',
    'phuddi', 'phudi', 'fuddi', 'fudi',
    'muth', 'moot', 'mootna',
    'peshaab', 'peshab',
    'hagga', 'hagna', 'haggu',
    'tatte', 'tatta', 'tatti',
    'jhandu', 'jhand',
    'charsi', 'nashe',
    'gandmasti', 'gandugiri',
    'chutiyapa', 'chutiyaap', 'chutiyapanti',
    'lodu', 'lodha', 'lodhay',
    'bsiwala', 'madarchot',
    'behanchot', 'bhenchot',
    'aulad', 'haram ki aulad',
    'suar ki aulad', 'kutte ki aulad',
    'gandpana', 'gandagi',
    'beghairat', 'ghairat',
    'zaalim', 'zalim',
    'kaatil', 'qatil',
    'gunda', 'goonda', 'gundai',
    'lafanga', 'lafange',
    'chirkeen', 'maila',
    'gandaputra', 'haramputra'
];

// ============================================
// HINGLISH SLANG & VARIATIONS
// ============================================
const HINGLISH_SLANG = [
    'benchod', 'banchod', 'bhenchod',
    'mcbc', 'bcmc', 'mckbc',
    'mkc', 'mkb', 'bkl',
    'gfy', 'gtfo', 'stfu', 'foff',
    'lmao', 'lmfao', 'rofl',
    'bhak', 'bhaak',
    'nikal', 'nikal lawde',
    'jaake', 'jaake maro',
    'gaali', 'galiya',
    'abuse', 'abusing',
    'chal be', 'chal hat',
    'abbe', 'abey', 'abe',
    'oye', 'oii', 'oyee',
    'kaminey', 'kameeno',
    'haramio', 'haramiyo',
    'kuton', 'kutton',
    'saalon', 'salon',
    'bc ka', 'mc ka',
    'tera baap', 'tere baap ka',
    'teri maa ka', 'tmkc', 'tmkb',
    'bkc', 'bklc',
    'chaman', 'chutad',
    'tuchha', 'tucha',
    'kachra', 'gandh',
    'sandaas', 'tatti khana'
];

// ============================================
// LEETSPEAK CHARACTER MAPPINGS
// ============================================
const LEETSPEAK_MAP = {
    '0': 'o',
    '1': 'i',
    '2': 'z',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '6': 'g',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '|': 'i',
    '+': 't',
    '(': 'c',
    '<': 'c',
    '{': 'c',
    '€': 'e',
    '£': 'l',
    '¥': 'y',
    '©': 'c',
    '®': 'r',
    '™': 'tm',
    'ā': 'a',
    'ē': 'e',
    'ī': 'i',
    'ō': 'o',
    'ū': 'u',
    'ü': 'u',
    'ö': 'o',
    'ä': 'a',
    'ß': 'ss',
    'ñ': 'n',
    'ç': 'c',
    'æ': 'ae',
    'œ': 'oe',
    'ø': 'o',
    'å': 'a',
    'α': 'a',
    'β': 'b',
    'ε': 'e',
    'и': 'n',
    'я': 'r',
    '†': 't',
    '‡': 't'
};

// ============================================
// PHONE NUMBER PATTERNS
// ============================================
const PHONE_PATTERNS = [
    // Direct number patterns
    /\b\d{10}\b/g,                           // 10 digit number
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,   // xxx-xxx-xxxx
    /\b\d{4}[-.\s]?\d{3}[-.\s]?\d{3}\b/g,   // xxxx-xxx-xxx
    /\b\d{5}[-.\s]?\d{5}\b/g,               // xxxxx-xxxxx
    /\+91[-.\s]?\d{10}\b/g,                  // +91 number
    /\+91[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\b91[-.\s]?\d{10}\b/g,                  // 91 number
    /\b0\d{10}\b/g,                          // 0xxxxxxxxxx
    /\b0\d{2,4}[-.\s]?\d{6,8}\b/g,          // STD codes
];

// Word-based number detection
const NUMBER_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10',
    // Hindi number words
    'ek': '1', 'do': '2', 'teen': '3', 'char': '4', 'paanch': '5',
    'panch': '5', 'chhah': '6', 'chhe': '6', 'saat': '7', 'aath': '8',
    'nau': '9', 'das': '10',
    // Common variations
    'won': '1', 'tu': '2', 'too': '2', 'tree': '3', 'for': '4', 'fore': '4',
    'fiv': '5', 'siz': '6', 'sev': '7', 'ate': '8', 'nein': '9'
};

// ============================================
// SOCIAL MEDIA PATTERNS
// ============================================
const SOCIAL_MEDIA_PATTERNS = [
    // Instagram
    /\b(insta|instagram|ig)\s*[:\-@]?\s*[a-zA-Z0-9_.]+/gi,
    /\binsta\s*id\b/gi,
    /\bfollow\s*(me\s*)?(on\s*)?insta/gi,
    
    // Snapchat
    /\b(snap|snapchat|sc)\s*[:\-@]?\s*[a-zA-Z0-9_.]+/gi,
    /\bsnap\s*id\b/gi,
    /\badd\s*(me\s*)?(on\s*)?snap/gi,
    
    // WhatsApp
    /\b(whatsapp|whats\s*app|wp|wa)\s*[:\-]?\s*\d*/gi,
    /\btext\s*(me\s*)?(on\s*)?whatsapp/gi,
    /\bping\s*(me\s*)?(on\s*)?wp/gi,
    
    // Telegram
    /\b(telegram|tg|telgram)\s*[:\-@]?\s*[a-zA-Z0-9_.]+/gi,
    /\bjoin\s*(my\s*)?telegram/gi,
    
    // Facebook
    /\b(facebook|fb)\s*[:\-@]?\s*[a-zA-Z0-9_.]+/gi,
    /\badd\s*(me\s*)?(on\s*)?fb/gi,
    
    // Twitter/X
    /\b(twitter|tweet)\s*[:\-@]?\s*[a-zA-Z0-9_.]+/gi,
    
    // Discord
    /\b(discord|dc)\s*[:\-#]?\s*[a-zA-Z0-9_.#]+/gi,
    
    // YouTube
    /\b(youtube|yt)\s*[:\-]?\s*[a-zA-Z0-9_.\/]+/gi,
    /\bsubscribe\s*(to\s*)?(my\s*)?channel/gi,
    
    // Generic social patterns
    /\bfollow\s*me\b/gi,
    /\bdm\s*me\b/gi,
    /\binbox\s*me\b/gi,
    /\bpm\s*me\b/gi,
    /\bcontact\s*me\b/gi,
    /\bcall\s*me\b/gi,
    /\btext\s*me\b/gi,
    /\bmessage\s*me\b/gi,
    /\bping\s*me\b/gi,
    /\bhit\s*me\s*up\b/gi,
    /\bhmu\b/gi,
    /\bmy\s*(number|no|num)\b/gi,
    /\bpersonal\s*(chat|msg|message)\b/gi,
    /\bprivate\s*(chat|msg|message)\b/gi,
    
    // Email patterns
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    /\bemail\s*[:\-]?\s*[a-zA-Z0-9._%+-]+/gi,
    /\bgmail\s*[:\-]?\s*[a-zA-Z0-9._%+-]+/gi,
    /\bmail\s*id\b/gi
];

// ============================================
// URL PATTERNS
// ============================================
const URL_PATTERNS = [
    // Standard URLs
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|edu|gov|io|co|in|uk|us|app|dev|xyz|info|biz|me|tv|cc|ly|to|link|site|online|live|tech|store|shop|blog|news|pro|club|website|space|fun)[^\s]*/gi,
    
    // Shortened URLs
    /\b(bit\.ly|tinyurl|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|short\.link|cutt\.ly|rb\.gy|tiny\.cc)[^\s]*/gi,
    
    // Common domains
    /\b[a-zA-Z0-9-]+\.(com|org|net|in|co\.in)[^\s]*/gi
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalize text by removing leetspeak and special characters
 * @param {string} text - Input text
 * @returns {string} - Normalized text
 */
function normalizeLeetspeak(text) {
    if (!text) return '';
    
    let normalized = text.toLowerCase();
    
    // Replace leetspeak characters
    for (const [leet, normal] of Object.entries(LEETSPEAK_MAP)) {
        normalized = normalized.split(leet).join(normal);
    }
    
    return normalized;
}

/**
 * Remove spaces between characters to detect spaced words
 * @param {string} text - Input text
 * @returns {string} - Text without internal spaces
 */
function removeInternalSpaces(text) {
    // Match patterns like "f u c k" or "f.u.c.k" or "f-u-c-k"
    return text.replace(/\b([a-zA-Z])\s*[-._]?\s*(?=[a-zA-Z]\b)/g, '$1');
}

/**
 * Normalize repeated characters (e.g., "fuuuuck" -> "fuck")
 * @param {string} text - Input text
 * @returns {string} - Normalized text
 */
function normalizeRepeatedChars(text) {
    // Replace 3+ repeated characters with 1
    return text.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Remove special characters but keep alphanumeric
 * @param {string} text - Input text
 * @returns {string} - Cleaned text
 */
function removeSpecialChars(text) {
    return text.replace(/[^a-zA-Z0-9\s]/g, '');
}

/**
 * Full text normalization for filtering
 * @param {string} text - Input text
 * @returns {string} - Fully normalized text
 */
function normalizeForFilter(text) {
    if (!text) return '';
    
    let normalized = text.toLowerCase();
    
    // Step 1: Normalize leetspeak
    normalized = normalizeLeetspeak(normalized);
    
    // Step 2: Remove internal spaces (detect spaced words)
    normalized = removeInternalSpaces(normalized);
    
    // Step 3: Normalize repeated characters
    normalized = normalizeRepeatedChars(normalized);
    
    // Step 4: Remove special characters
    normalized = removeSpecialChars(normalized);
    
    return normalized.trim();
}

/**
 * Create regex pattern from word (handles partial matches)
 * @param {string} word - Word to create pattern for
 * @returns {RegExp} - Regex pattern
 */
function createWordPattern(word) {
    // Escape special regex characters
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow word boundaries or special characters between
    return new RegExp(`\\b${escaped}\\b|${escaped}`, 'gi');
}

/**
 * Convert written numbers to digits
 * @param {string} text - Input text
 * @returns {string} - Text with numbers converted
 */
function convertWrittenNumbers(text) {
    let converted = text.toLowerCase();
    
    for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
        const pattern = new RegExp(`\\b${word}\\b`, 'gi');
        converted = converted.replace(pattern, digit);
    }
    
    return converted;
}

/**
 * Extract potential phone numbers from text
 * @param {string} text - Input text
 * @returns {Array} - Array of detected numbers
 */
function extractPhoneNumbers(text) {
    const numbers = [];
    
    // First convert written numbers
    const converted = convertWrittenNumbers(text);
    
    // Remove all non-digit characters for analysis
    const digitsOnly = converted.replace(/\D/g, '');
    
    // Check if there are 10+ consecutive digits
    if (digitsOnly.length >= 10) {
        // Extract 10-digit sequences
        const matches = digitsOnly.match(/\d{10,}/g);
        if (matches) {
            numbers.push(...matches);
        }
    }
    
    // Apply phone patterns
    for (const pattern of PHONE_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            numbers.push(...matches);
        }
    }
    
    return [...new Set(numbers)]; // Remove duplicates
}

/**
 * Check if text contains social media references
 * @param {string} text - Input text
 * @returns {Object} - Detection result with matches
 */
function detectSocialMedia(text) {
    const detected = [];
    
    for (const pattern of SOCIAL_MEDIA_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            detected.push(...matches);
        }
    }
    
    return {
        found: detected.length > 0,
        matches: [...new Set(detected)]
    };
}

/**
 * Check if text contains URLs
 * @param {string} text - Input text
 * @returns {Object} - Detection result with matches
 */
function detectURLs(text) {
    const detected = [];
    
    for (const pattern of URL_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            detected.push(...matches);
        }
    }
    
    return {
        found: detected.length > 0,
        matches: [...new Set(detected)]
    };
}

/**
 * Combine all bad words into one set for efficient lookup
 */
function getAllBadWords() {
    return new Set([
        ...ENGLISH_BAD_WORDS,
        ...HINDI_BAD_WORDS,
        ...HINGLISH_SLANG
    ].map(word => word.toLowerCase()));
}

// Create the combined set
const ALL_BAD_WORDS = getAllBadWords();

// ============================================
// EXPORTS FOR PART 1
// ============================================
export {
    // Configuration
    FILTER_CONFIG,
    
    // Word lists
    ENGLISH_BAD_WORDS,
    HINDI_BAD_WORDS,
    HINGLISH_SLANG,
    ALL_BAD_WORDS,
    
    // Mappings
    LEETSPEAK_MAP,
    NUMBER_WORDS,
    
    // Patterns
    PHONE_PATTERNS,
    SOCIAL_MEDIA_PATTERNS,
    URL_PATTERNS,
    
    // Utility functions
    normalizeLeetspeak,
    removeInternalSpaces,
    normalizeRepeatedChars,
    removeSpecialChars,
    normalizeForFilter,
    createWordPattern,
    convertWrittenNumbers,
    extractPhoneNumbers,
    detectSocialMedia,
    detectURLs
};

console.log('📋 Filter System (Part 1) - Word lists and utilities loaded');
console.log(`📊 Total bad words loaded: ${ALL_BAD_WORDS.size}`);
/**
 * ============================================
 * STUDY HUB - Content Filtering System
 * ============================================
 * Part 2: Main Filter Class & Detection Logic
 * 
 * Features:
 * - ContentFilter class with all detection methods
 * - Spam detection with rate limiting
 * - Violation tracking and actions
 * - Message validation
 * ============================================
 */

import {
    db,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    collection,
    addDoc,
    serverTimestamp,
    increment,
    Timestamp
} from './firebase-config.js';

import {
    FILTER_CONFIG,
    ALL_BAD_WORDS,
    normalizeForFilter,
    extractPhoneNumbers,
    detectSocialMedia,
    detectURLs,
    normalizeLeetspeak,
    removeInternalSpaces,
    normalizeRepeatedChars
} from './filter.js';

// ============================================
// FILTER RESULT TYPES
// ============================================
const FILTER_RESULT = {
    CLEAN: 'clean',
    ABUSIVE: 'abusive',
    SPAM: 'spam',
    CONTACT: 'contact',
    URL: 'url',
    TOO_LONG: 'too_long',
    TOO_SHORT: 'too_short',
    COOLDOWN: 'cooldown',
    MUTED: 'muted',
    BANNED: 'banned'
};

const FILTER_MESSAGES = {
    [FILTER_RESULT.CLEAN]: '',
    [FILTER_RESULT.ABUSIVE]: '🚫 Your message contains inappropriate language. Please be respectful.',
    [FILTER_RESULT.SPAM]: '⏱️ You are sending messages too fast. Please slow down.',
    [FILTER_RESULT.CONTACT]: '📵 Sharing personal contact information is not allowed.',
    [FILTER_RESULT.URL]: '🔗 Sending links is not allowed in this chat.',
    [FILTER_RESULT.TOO_LONG]: `📏 Message too long. Maximum ${FILTER_CONFIG.MAX_MESSAGE_LENGTH} characters allowed.`,
    [FILTER_RESULT.TOO_SHORT]: '📝 Message is too short.',
    [FILTER_RESULT.COOLDOWN]: '⏳ Please wait before sending another message.',
    [FILTER_RESULT.MUTED]: '🔇 You are currently muted and cannot send messages.',
    [FILTER_RESULT.BANNED]: '⛔ You have been banned from this chat.'
};

// ============================================
// CONTENT FILTER CLASS
// ============================================
class ContentFilter {
    constructor() {
        // User message tracking (for spam detection)
        this.userMessageLog = new Map();
        
        // User cooldown tracking
        this.userCooldowns = new Map();
        
        // Recent messages for duplicate detection
        this.recentMessages = new Map();
        
        // Violation counts (in memory, synced with Firestore)
        this.violationCounts = new Map();
        
        console.log('🛡️ Content Filter initialized');
    }

    // ============================================
    // MAIN FILTER METHOD
    // ============================================
    
    /**
     * Main method to check if a message is allowed
     * @param {string} message - The message to check
     * @param {string} userId - The user's ID
     * @param {Object} userData - User data from Firestore
     * @returns {Object} - Result with allowed status and reason
     */
    async checkMessage(message, userId, userData = null) {
        try {
            // Step 0: Check if user is muted or banned
            if (userData) {
                const statusCheck = this.checkUserStatus(userData);
                if (!statusCheck.allowed) {
                    return statusCheck;
                }
            }

            // Step 1: Check message length
            const lengthCheck = this.checkMessageLength(message);
            if (!lengthCheck.allowed) {
                return lengthCheck;
            }

            // Step 2: Check cooldown
            const cooldownCheck = this.checkCooldown(userId);
            if (!cooldownCheck.allowed) {
                return cooldownCheck;
            }

            // Step 3: Check for URLs
            const urlCheck = this.checkForURLs(message);
            if (!urlCheck.allowed) {
                await this.logViolation(userId, FILTER_RESULT.URL, message);
                return urlCheck;
            }

            // Step 4: Check for contact information
            const contactCheck = this.checkForContactInfo(message);
            if (!contactCheck.allowed) {
                await this.handleContactViolation(userId, message);
                return contactCheck;
            }

            // Step 5: Check for abusive content
            const abusiveCheck = this.checkForAbusiveContent(message);
            if (!abusiveCheck.allowed) {
                await this.handleAbusiveViolation(userId, message, abusiveCheck.matches);
                return abusiveCheck;
            }

            // Step 6: Check for spam
            const spamCheck = this.checkForSpam(userId, message);
            if (!spamCheck.allowed) {
                await this.handleSpamViolation(userId, message);
                return spamCheck;
            }

            // Message passed all checks
            this.recordMessage(userId, message);
            this.setCooldown(userId);

            return {
                allowed: true,
                type: FILTER_RESULT.CLEAN,
                message: ''
            };

        } catch (error) {
            console.error('Filter check error:', error);
            // On error, allow the message but log it
            return {
                allowed: true,
                type: FILTER_RESULT.CLEAN,
                message: '',
                error: error.message
            };
        }
    }

    // ============================================
    // USER STATUS CHECK
    // ============================================
    
    /**
     * Check if user is muted or banned
     * @param {Object} userData - User data from Firestore
     * @returns {Object} - Check result
     */
    checkUserStatus(userData) {
        // Check if banned
        if (userData.status === 'banned') {
            return {
                allowed: false,
                type: FILTER_RESULT.BANNED,
                message: FILTER_MESSAGES[FILTER_RESULT.BANNED],
                reason: userData.banReason || 'Violation of community guidelines'
            };
        }

        // Check if muted
        if (userData.mutedUntil) {
            const mutedUntil = userData.mutedUntil.toDate ? 
                userData.mutedUntil.toDate() : 
                new Date(userData.mutedUntil);
            
            if (mutedUntil > new Date()) {
                const remainingTime = this.formatRemainingTime(mutedUntil);
                return {
                    allowed: false,
                    type: FILTER_RESULT.MUTED,
                    message: `🔇 You are muted. Time remaining: ${remainingTime}`,
                    mutedUntil: mutedUntil
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Format remaining mute time
     * @param {Date} endTime - When mute ends
     * @returns {string} - Formatted time string
     */
    formatRemainingTime(endTime) {
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) return '0 seconds';
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} day${days > 1 ? 's' : ''} ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
        }
        
        if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        
        if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
        
        return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }

    // ============================================
    // MESSAGE LENGTH CHECK
    // ============================================
    
    /**
     * Check if message length is valid
     * @param {string} message - The message to check
     * @returns {Object} - Check result
     */
    checkMessageLength(message) {
        if (!message || message.trim().length < FILTER_CONFIG.MIN_MESSAGE_LENGTH) {
            return {
                allowed: false,
                type: FILTER_RESULT.TOO_SHORT,
                message: FILTER_MESSAGES[FILTER_RESULT.TOO_SHORT]
            };
        }

        if (message.length > FILTER_CONFIG.MAX_MESSAGE_LENGTH) {
            return {
                allowed: false,
                type: FILTER_RESULT.TOO_LONG,
                message: FILTER_MESSAGES[FILTER_RESULT.TOO_LONG]
            };
        }

        return { allowed: true };
    }

    // ============================================
    // COOLDOWN CHECK
    // ============================================
    
    /**
     * Check if user is in cooldown period
     * @param {string} userId - User ID
     * @returns {Object} - Check result
     */
    checkCooldown(userId) {
        const lastMessage = this.userCooldowns.get(userId);
        
        if (lastMessage) {
            const timeSince = Date.now() - lastMessage;
            
            if (timeSince < FILTER_CONFIG.MESSAGE_COOLDOWN) {
                const remaining = Math.ceil((FILTER_CONFIG.MESSAGE_COOLDOWN - timeSince) / 1000);
                return {
                    allowed: false,
                    type: FILTER_RESULT.COOLDOWN,
                    message: `⏳ Please wait ${remaining} second${remaining !== 1 ? 's' : ''} before sending another message.`,
                    remainingSeconds: remaining
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Set cooldown for user
     * @param {string} userId - User ID
     */
    setCooldown(userId) {
        this.userCooldowns.set(userId, Date.now());
    }

    // ============================================
    // URL DETECTION
    // ============================================
    
    /**
     * Check if message contains URLs
     * @param {string} message - The message to check
     * @returns {Object} - Check result
     */
    checkForURLs(message) {
        const urlResult = detectURLs(message);
        
        if (urlResult.found) {
            return {
                allowed: false,
                type: FILTER_RESULT.URL,
                message: FILTER_MESSAGES[FILTER_RESULT.URL],
                matches: urlResult.matches
            };
        }

        return { allowed: true };
    }

    // ============================================
    // CONTACT INFORMATION DETECTION
    // ============================================
    
    /**
     * Check if message contains contact information
     * @param {string} message - The message to check
     * @returns {Object} - Check result
     */
    checkForContactInfo(message) {
        // Check for phone numbers
        const phoneNumbers = extractPhoneNumbers(message);
        if (phoneNumbers.length > 0) {
            return {
                allowed: false,
                type: FILTER_RESULT.CONTACT,
                message: FILTER_MESSAGES[FILTER_RESULT.CONTACT],
                matches: phoneNumbers,
                subtype: 'phone'
            };
        }

        // Check for social media handles
        const socialResult = detectSocialMedia(message);
        if (socialResult.found) {
            return {
                allowed: false,
                type: FILTER_RESULT.CONTACT,
                message: FILTER_MESSAGES[FILTER_RESULT.CONTACT],
                matches: socialResult.matches,
                subtype: 'social'
            };
        }

        return { allowed: true };
    }

    // ============================================
    // ABUSIVE CONTENT DETECTION
    // ============================================
    
    /**
     * Check if message contains abusive content
     * @param {string} message - The message to check
     * @returns {Object} - Check result
     */
    checkForAbusiveContent(message) {
        const foundWords = [];
        
        // Normalize the message for comparison
        const normalizedMessage = normalizeForFilter(message);
        
        // Also create variations
        const variations = this.createMessageVariations(message);
        
        // Check each bad word
        for (const badWord of ALL_BAD_WORDS) {
            // Check in original normalized message
            if (this.containsBadWord(normalizedMessage, badWord)) {
                foundWords.push(badWord);
                continue;
            }
            
            // Check in variations
            for (const variation of variations) {
                if (this.containsBadWord(variation, badWord)) {
                    foundWords.push(badWord);
                    break;
                }
            }
        }

        // Also check for censored words (f***, sh*t, etc.)
        const censoredCheck = this.checkCensoredPatterns(message);
        if (censoredCheck.length > 0) {
            foundWords.push(...censoredCheck);
        }

        if (foundWords.length > 0) {
            return {
                allowed: false,
                type: FILTER_RESULT.ABUSIVE,
                message: FILTER_MESSAGES[FILTER_RESULT.ABUSIVE],
                matches: [...new Set(foundWords)]
            };
        }

        return { allowed: true };
    }

    /**
     * Create variations of message for thorough checking
     * @param {string} message - Original message
     * @returns {Array} - Array of variations
     */
    createMessageVariations(message) {
        const variations = [];
        const lower = message.toLowerCase();
        
        // Variation 1: Just lowercase
        variations.push(lower);
        
        // Variation 2: Leetspeak normalized
        variations.push(normalizeLeetspeak(lower));
        
        // Variation 3: Spaces removed between letters
        variations.push(removeInternalSpaces(lower));
        
        // Variation 4: Repeated chars normalized
        variations.push(normalizeRepeatedChars(lower));
        
        // Variation 5: All special chars removed
        variations.push(lower.replace(/[^a-zA-Z]/g, ''));
        
        // Variation 6: Combination
        let combined = lower;
        combined = normalizeLeetspeak(combined);
        combined = removeInternalSpaces(combined);
        combined = normalizeRepeatedChars(combined);
        combined = combined.replace(/[^a-zA-Z]/g, '');
        variations.push(combined);
        
        return variations;
    }

    /**
     * Check if text contains a bad word
     * @param {string} text - Normalized text
     * @param {string} badWord - Bad word to check
     * @returns {boolean}
     */
    containsBadWord(text, badWord) {
        if (!text || !badWord) return false;
        
        // Direct inclusion check
        if (text.includes(badWord)) {
            return true;
        }
        
        // Word boundary check
        const pattern = new RegExp(`\\b${badWord}\\b`, 'i');
        if (pattern.test(text)) {
            return true;
        }
        
        return false;
    }

    /**
     * Check for partially censored words like f***, sh!t, etc.
     * @param {string} message - Original message
     * @returns {Array} - Detected censored patterns
     */
    checkCensoredPatterns(message) {
        const detected = [];
        const lower = message.toLowerCase();
        
        // Common censored patterns
        const censoredPatterns = [
            // F-word variations
            /f[\*\#\@\$\%\!\.\-\_]+c?k/gi,
            /f[\*\#\@\$\%\!\.\-\_]+u[\*\#\@\$\%\!\.\-\_]+c[\*\#\@\$\%\!\.\-\_]+k/gi,
            /fk|fuk|fuc|phuck|phuk/gi,
            
            // S-word variations
            /sh[\*\#\@\$\%\!\.\-\_]+t/gi,
            /sh!t|sh1t|sht/gi,
            
            // B-word variations
            /b[\*\#\@\$\%\!\.\-\_]+tch/gi,
            /b!tch|b1tch|bytch/gi,
            
            // A-word variations
            /a[\*\#\@\$\%\!\.\-\_]+s[\*\#\@\$\%\!\.\-\_]*h[\*\#\@\$\%\!\.\-\_]*le/gi,
            /a\$\$/gi,
            
            // C-word variations
            /c[\*\#\@\$\%\!\.\-\_]+nt/gi,
            
            // D-word variations
            /d[\*\#\@\$\%\!\.\-\_]+ck/gi,
            /d!ck|d1ck/gi,
            
            // Hindi censored
            /m[\*\#\@\$\%\!\.\-\_]+c/gi,
            /b[\*\#\@\$\%\!\.\-\_]+c/gi,
            /ch[\*\#\@\$\%\!\.\-\_]+t/gi,
            /g[\*\#\@\$\%\!\.\-\_]+nd/gi,
            /l[\*\#\@\$\%\!\.\-\_]+nd/gi,
            /bh[\*\#\@\$\%\!\.\-\_]+sd/gi,
            /r[\*\#\@\$\%\!\.\-\_]+ndi/gi
        ];
        
        for (const pattern of censoredPatterns) {
            const matches = message.match(pattern);
            if (matches) {
                detected.push(...matches);
            }
        }
        
        return detected;
    }

    // ============================================
    // SPAM DETECTION
    // ============================================
    
    /**
     * Check if message is spam
     * @param {string} userId - User ID
     * @param {string} message - The message
     * @returns {Object} - Check result
     */
    checkForSpam(userId, message) {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const fiveMinutesAgo = now - 300000;
        
        // Get user's message log
        let userLog = this.userMessageLog.get(userId) || [];
        
        // Clean old entries
        userLog = userLog.filter(entry => entry.timestamp > fiveMinutesAgo);
        
        // Count messages in last minute
        const messagesLastMinute = userLog.filter(
            entry => entry.timestamp > oneMinuteAgo
        ).length;
        
        // Count messages in last 5 minutes
        const messagesLast5Minutes = userLog.length;
        
        // Check rate limits
        if (messagesLastMinute >= FILTER_CONFIG.MAX_MESSAGES_PER_MINUTE) {
            return {
                allowed: false,
                type: FILTER_RESULT.SPAM,
                message: '⏱️ Too many messages! Please wait a minute.',
                subtype: 'rate_limit_minute'
            };
        }
        
        if (messagesLast5Minutes >= FILTER_CONFIG.MAX_MESSAGES_PER_5_MINUTES) {
            return {
                allowed: false,
                type: FILTER_RESULT.SPAM,
                message: '⏱️ Too many messages! Please slow down.',
                subtype: 'rate_limit_5min'
            };
        }
        
        // Check for duplicate messages
        const duplicateCheck = this.checkDuplicateMessage(userId, message);
        if (!duplicateCheck.allowed) {
            return duplicateCheck;
        }
        
        // Check for very short message spam
        const shortSpamCheck = this.checkShortMessageSpam(userLog, message);
        if (!shortSpamCheck.allowed) {
            return shortSpamCheck;
        }
        
        // Update message log
        this.userMessageLog.set(userId, userLog);
        
        return { allowed: true };
    }

    /**
     * Check for duplicate messages
     * @param {string} userId - User ID
     * @param {string} message - Current message
     * @returns {Object} - Check result
     */
    checkDuplicateMessage(userId, message) {
        const recentKey = `${userId}_recent`;
        const recentList = this.recentMessages.get(recentKey) || [];
        const now = Date.now();
        
        // Clean old entries
        const validRecent = recentList.filter(
            entry => (now - entry.timestamp) < FILTER_CONFIG.DUPLICATE_MESSAGE_WINDOW
        );
        
        // Normalize message for comparison
        const normalizedNew = message.toLowerCase().trim();
        
        // Check for exact or near duplicates
        for (const entry of validRecent) {
            const similarity = this.calculateSimilarity(normalizedNew, entry.message);
            
            if (similarity > 0.85) { // 85% similarity threshold
                return {
                    allowed: false,
                    type: FILTER_RESULT.SPAM,
                    message: '🔄 Please don\'t send duplicate messages.',
                    subtype: 'duplicate'
                };
            }
        }
        
        // Add current message to recent list
        validRecent.push({
            message: normalizedNew,
            timestamp: now
        });
        
        // Keep only last 5 messages
        this.recentMessages.set(recentKey, validRecent.slice(-5));
        
        return { allowed: true };
    }

    /**
     * Calculate similarity between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity score (0-1)
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1;
        if (!str1 || !str2) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1;
        
        // Simple Levenshtein-based similarity
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Edit distance
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Check for short message spam
     * @param {Array} userLog - User's recent messages
     * @param {string} message - Current message
     * @returns {Object} - Check result
     */
    checkShortMessageSpam(userLog, message) {
        if (message.length > 5) {
            return { allowed: true };
        }
        
        // Count short messages in last minute
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        const shortMessagesCount = userLog.filter(entry => 
            entry.timestamp > oneMinuteAgo && 
            entry.length <= 5
        ).length;
        
        if (shortMessagesCount >= 5) {
            return {
                allowed: false,
                type: FILTER_RESULT.SPAM,
                message: '📝 Please send meaningful messages instead of short spam.',
                subtype: 'short_spam'
            };
        }
        
        return { allowed: true };
    }

    /**
     * Record a sent message for tracking
     * @param {string} userId - User ID
     * @param {string} message - The message
     */
    recordMessage(userId, message) {
        let userLog = this.userMessageLog.get(userId) || [];
        
        userLog.push({
            timestamp: Date.now(),
            length: message.length,
            hash: this.simpleHash(message)
        });
        
        // Keep only last 20 messages
        if (userLog.length > 20) {
            userLog = userLog.slice(-20);
        }
        
        this.userMessageLog.set(userId, userLog);
    }

    /**
     * Simple hash function for message comparison
     * @param {string} str - String to hash
     * @returns {number} - Hash value
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    // ============================================
    // VIOLATION HANDLING
    // ============================================
    
    /**
     * Handle abusive content violation
     * @param {string} userId - User ID
     * @param {string} message - The message
     * @param {Array} matches - Matched bad words
     */
    async handleAbusiveViolation(userId, message, matches) {
        try {
            // Log the violation
            await this.logViolation(userId, FILTER_RESULT.ABUSIVE, message, matches);
            
            // Get current warning count
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) return;
            
            const userData = userSnap.data();
            const currentWarnings = (userData.warningCount || 0) + 1;
            
            // Update warning count
            await updateDoc(userRef, {
                warningCount: currentWarnings,
                lastWarning: serverTimestamp()
            });
            
            // Check for automatic actions
            if (currentWarnings >= FILTER_CONFIG.WARNINGS_FOR_PERMANENT_BAN) {
                await this.banUser(userId, 'Repeated abusive language violations');
            } else if (currentWarnings >= FILTER_CONFIG.WARNINGS_FOR_24HR_MUTE) {
                await this.muteUser(userId, 24 * 60 * 60 * 1000); // 24 hours
            } else if (currentWarnings >= FILTER_CONFIG.WARNINGS_FOR_1HR_MUTE) {
                await this.muteUser(userId, 60 * 60 * 1000); // 1 hour
            }
            
        } catch (error) {
            console.error('Error handling abusive violation:', error);
        }
    }

    /**
     * Handle contact information violation
     * @param {string} userId - User ID
     * @param {string} message - The message
     */
    async handleContactViolation(userId, message) {
        try {
            await this.logViolation(userId, FILTER_RESULT.CONTACT, message);
            
            // Get violation count
            const key = `${userId}_contact`;
            const count = (this.violationCounts.get(key) || 0) + 1;
            this.violationCounts.set(key, count);
            
            // Check for actions
            if (count >= FILTER_CONFIG.CONTACT_WARNINGS_FOR_BAN) {
                await this.banUser(userId, 'Repeated attempts to share contact information');
            } else if (count >= FILTER_CONFIG.CONTACT_WARNINGS_FOR_24HR_MUTE) {
                await this.muteUser(userId, 24 * 60 * 60 * 1000);
            }
            
        } catch (error) {
            console.error('Error handling contact violation:', error);
        }
    }

    /**
     * Handle spam violation
     * @param {string} userId - User ID
     * @param {string} message - The message
     */
    async handleSpamViolation(userId, message) {
        try {
            await this.logViolation(userId, FILTER_RESULT.SPAM, message);
            
            // Get spam violation count
            const key = `${userId}_spam`;
            const count = (this.violationCounts.get(key) || 0) + 1;
            this.violationCounts.set(key, count);
            
            // Progressive muting
            if (count >= 3) {
                await this.muteUser(userId, 24 * 60 * 60 * 1000); // 24 hours
            } else if (count >= 2) {
                await this.muteUser(userId, 10 * 60 * 1000); // 10 minutes
            }
            // First violation is just a warning
            
        } catch (error) {
            console.error('Error handling spam violation:', error);
        }
    }

    /**
     * Log a violation to Firestore
     * @param {string} userId - User ID
     * @param {string} type - Violation type
     * @param {string} message - The message
     * @param {Array} matches - Matched patterns (optional)
     */
    async logViolation(userId, type, message, matches = []) {
        try {
            // Add to filter logs
            await addDoc(collection(db, 'filterLogs'), {
                userId: userId,
                type: type,
                message: message,
                matches: matches,
                timestamp: serverTimestamp()
            });
            
            // Also add to archived messages
            await addDoc(collection(db, 'archivedMessages'), {
                senderId: userId,
                content: message,
                reason: type,
                matches: matches,
                isArchived: true,
                timestamp: serverTimestamp()
            });
            
        } catch (error) {
            console.error('Error logging violation:', error);
        }
    }

    /**
     * Mute a user
     * @param {string} userId - User ID
     * @param {number} duration - Duration in milliseconds
     */
    async muteUser(userId, duration) {
        try {
            const mutedUntil = new Date(Date.now() + duration);
            
            await updateDoc(doc(db, 'users', userId), {
                mutedUntil: Timestamp.fromDate(mutedUntil),
                status: 'muted'
            });
            
            console.log(`User ${userId} muted until ${mutedUntil}`);
            
        } catch (error) {
            console.error('Error muting user:', error);
        }
    }

    /**
     * Ban a user permanently
     * @param {string} userId - User ID
     * @param {string} reason - Ban reason
     */
    async banUser(userId, reason) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                status: 'banned',
                banReason: reason,
                bannedAt: serverTimestamp()
            });
            
            console.log(`User ${userId} banned: ${reason}`);
            
        } catch (error) {
            console.error('Error banning user:', error);
        }
    }

    // ============================================
    // UTILITY METHODS
    // ============================================
    
    /**
     * Reset user's violation counts (for admin use)
     * @param {string} userId - User ID
     */
    resetViolations(userId) {
        this.violationCounts.delete(`${userId}_contact`);
        this.violationCounts.delete(`${userId}_spam`);
        this.userMessageLog.delete(userId);
        this.recentMessages.delete(`${userId}_recent`);
        this.userCooldowns.delete(userId);
    }

    /**
     * Get violation stats for a user
     * @param {string} userId - User ID
     * @returns {Object} - Violation stats
     */
    getViolationStats(userId) {
        return {
            contactViolations: this.violationCounts.get(`${userId}_contact`) || 0,
            spamViolations: this.violationCounts.get(`${userId}_spam`) || 0,
            recentMessages: (this.userMessageLog.get(userId) || []).length,
            isInCooldown: this.userCooldowns.has(userId)
        };
    }

    /**
     * Clear all tracking data (for testing)
     */
    clearAllTracking() {
        this.userMessageLog.clear();
        this.userCooldowns.clear();
        this.recentMessages.clear();
        this.violationCounts.clear();
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================
const contentFilter = new ContentFilter();

// ============================================
// EXPORT
// ============================================
export {
    ContentFilter,
    contentFilter,
    FILTER_RESULT,
    FILTER_MESSAGES,
    FILTER_CONFIG
};

console.log('🛡️ Filter System (Part 2) - ContentFilter class loaded');