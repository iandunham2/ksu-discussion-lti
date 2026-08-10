"use strict";
/**
 * Shared D2L/Brightspace logging utilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLogLevel = setLogLevel;
exports.log = log;
exports.enableStdoutGuard = enableStdoutGuard;
exports.getLogger = getLogger;
let currentLevel = "INFO";
const LEVEL_ORDER = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};
function setLogLevel(level) {
    currentLevel = level;
}
/**
 * Redact sensitive patterns from log output.
 * Tokens, passwords, and secrets are replaced with first 8 chars + "...REDACTED".
 */
function redact(value) {
    // Redact Bearer tokens
    value = value.replace(/Bearer\s+([A-Za-z0-9._~+/=-]{8})[A-Za-z0-9._~+/=-]*/g, "Bearer $1...REDACTED");
    // Redact cookie: prefixed tokens
    value = value.replace(/cookie:([^\s]{8})[^\s]*/g, "cookie:$1...REDACTED");
    // Redact anything that looks like a long token (40+ chars of base64-like)
    value = value.replace(/([A-Za-z0-9._~+/=-]{40,})/g, (match) => match.substring(0, 8) + "...REDACTED");
    return value;
}
function log(level, message, ...args) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel])
        return;
    const timestamp = new Date().toISOString();
    const safeMessage = redact(message);
    console.error(`[${timestamp}] [${level}] ${safeMessage}`, ...args);
}
// Override console.log in production to prevent accidental stdout writes
function enableStdoutGuard() {
    console.log = (...args) => {
        console.error("[WARN] console.log intercepted (would corrupt stdio):", ...args);
    };
}
/**
 * Create a namespaced logger that writes through the shared logging utility.
 * Info messages are written to stdout; debug/warn/error go to stderr.
 */
function getLogger(namespace) {
    const prefix = `[${namespace}]`;
    return {
        debug: (message, ...args) => log("DEBUG", `${prefix} ${message}`, ...args),
        info: (message, ...args) => {
            if (LEVEL_ORDER.INFO < LEVEL_ORDER[currentLevel])
                return;
            const timestamp = new Date().toISOString();
            const safeMessage = redact(message);
            console.log(`[${timestamp}] [INFO] ${prefix} ${safeMessage}`, ...args);
        },
        warn: (message, ...args) => log("WARN", `${prefix} ${message}`, ...args),
        error: (message, ...args) => log("ERROR", `${prefix} ${message}`, ...args),
    };
}
//# sourceMappingURL=logger.js.map