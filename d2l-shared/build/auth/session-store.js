"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs/promises"));
const fsSync = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const DEFAULT_SESSION_DIR = path.join(os.homedir(), ".d2l-session");
const SESSION_FILE_NAME = "session.json";
const SESSION_VERSION = 1;
// Encryption constants
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16; // GCM auth tag length
const SALT_LENGTH = 16;
const SALT_FILE_NAME = "salt";
/**
 * SessionStore manages encrypted token persistence to disk.
 * Uses AES-256-GCM for encryption with a key derived from username + hostname.
 */
class SessionStore {
    sessionDir;
    sessionFilePath;
    constructor(sessionDir) {
        this.sessionDir = sessionDir ?? DEFAULT_SESSION_DIR;
        this.sessionFilePath = path.join(this.sessionDir, SESSION_FILE_NAME);
    }
    /**
     * Get or create a random salt unique to this installation.
     * Stored at ~/.d2l-session/salt with restricted permissions.
     */
    getOrCreateSalt() {
        const saltPath = path.join(this.sessionDir, SALT_FILE_NAME);
        try {
            return fsSync.readFileSync(saltPath);
        }
        catch {
            // Salt doesn't exist yet — create session dir and generate one
            const isWindows = process.platform === "win32";
            fsSync.mkdirSync(this.sessionDir, {
                recursive: true,
                ...(isWindows ? {} : { mode: 0o700 }),
            });
            const salt = crypto.randomBytes(SALT_LENGTH);
            fsSync.writeFileSync(saltPath, salt, {
                ...(isWindows ? {} : { mode: 0o600 }),
            });
            return salt;
        }
    }
    /**
     * Derive AES-256 key from username and hostname using scrypt.
     * Uses a per-installation random salt to prevent precomputation attacks.
     */
    deriveKey() {
        const username = os.userInfo().username;
        const hostname = os.hostname();
        const keyMaterial = username + hostname;
        const salt = this.getOrCreateSalt();
        // Use scrypt to derive a 32-byte key (256 bits for AES-256)
        return crypto.scryptSync(keyMaterial, salt, 32);
    }
    /**
     * Encrypt plaintext using AES-256-GCM.
     * Returns IV, auth tag, and ciphertext as hex strings.
     */
    encrypt(plaintext) {
        const key = this.deriveKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(plaintext, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag();
        return {
            iv: iv.toString("hex"),
            authTag: authTag.toString("hex"),
            data: encrypted,
        };
    }
    /**
     * Decrypt ciphertext using AES-256-GCM.
     * Returns plaintext string, or throws if auth tag verification fails.
     */
    decrypt(encrypted) {
        const key = this.deriveKey();
        const iv = Buffer.from(encrypted.iv, "hex");
        const authTag = Buffer.from(encrypted.authTag, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted.data, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    }
    /**
     * Save token to disk with encryption.
     * Creates session directory if it doesn't exist.
     */
    async save(token) {
        try {
            // Ensure session directory exists with restricted permissions (owner-only on Unix)
            const isWindows = process.platform === "win32";
            await fs.mkdir(this.sessionDir, {
                recursive: true,
                ...(isWindows ? {} : { mode: 0o700 }),
            });
            const plaintext = JSON.stringify(token);
            const encrypted = this.encrypt(plaintext);
            const sessionFile = {
                version: SESSION_VERSION,
                encrypted,
                createdAt: Date.now(),
                expiresAt: token.expiresAt,
            };
            await fs.writeFile(this.sessionFilePath, JSON.stringify(sessionFile, null, 2), {
                encoding: "utf-8",
                ...(isWindows ? {} : { mode: 0o600 }),
            });
            (0, logger_js_1.log)("DEBUG", `Session saved to ${this.sessionFilePath}`);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            (0, logger_js_1.log)("ERROR", `Failed to save session: ${err.message}`);
            throw new errors_js_1.SessionStoreError("Failed to save session", err);
        }
    }
    /**
     * Load token from disk with decryption.
     * Returns null if file doesn't exist or is corrupted (graceful degradation).
     */
    async load() {
        try {
            // Check if file exists
            try {
                await fs.access(this.sessionFilePath);
            }
            catch {
                (0, logger_js_1.log)("DEBUG", "No session file found");
                return null;
            }
            // Read and parse session file
            const fileContent = await fs.readFile(this.sessionFilePath, "utf-8");
            const sessionFile = JSON.parse(fileContent);
            // Decrypt token data
            const plaintext = this.decrypt(sessionFile.encrypted);
            const token = JSON.parse(plaintext);
            (0, logger_js_1.log)("DEBUG", `Session loaded from ${this.sessionFilePath}`);
            return token;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            (0, logger_js_1.log)("WARN", `Failed to load session: ${err.message}`);
            // Return null instead of throwing - graceful degradation
            return null;
        }
    }
    /**
     * Clear session by deleting the session file.
     */
    async clear() {
        try {
            await fs.unlink(this.sessionFilePath);
            (0, logger_js_1.log)("DEBUG", `Session cleared: ${this.sessionFilePath}`);
        }
        catch (error) {
            // Ignore ENOENT errors - file already doesn't exist
            if (error.code !== "ENOENT") {
                const err = error instanceof Error ? error : new Error(String(error));
                (0, logger_js_1.log)("WARN", `Failed to clear session: ${err.message}`);
            }
        }
    }
}
exports.SessionStore = SessionStore;
//# sourceMappingURL=session-store.js.map