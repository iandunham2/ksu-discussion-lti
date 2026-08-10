"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenManager = void 0;
const session_store_js_1 = require("./session-store.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Token refresh buffer - tokens within this time of expiry are considered invalid.
 * This prevents using tokens that might expire during a request.
 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
/**
 * TokenManager manages token lifecycle with in-memory caching and disk persistence.
 * Handles expiry detection with a configurable refresh buffer.
 */
class TokenManager {
    cachedToken = null;
    sessionStore;
    constructor(sessionDir) {
        this.sessionStore = new session_store_js_1.SessionStore(sessionDir);
    }
    /**
     * Get the current token if valid, otherwise null.
     * Checks memory cache first, then loads from disk if needed.
     * Returns null if token is expired or within refresh buffer.
     */
    async getToken() {
        // Check memory cache first
        if (this.cachedToken && this.isValid(this.cachedToken)) {
            (0, logger_js_1.log)("DEBUG", "Returning cached token");
            return this.cachedToken;
        }
        // Try loading from disk
        const storedToken = await this.sessionStore.load();
        if (storedToken && this.isValid(storedToken)) {
            (0, logger_js_1.log)("DEBUG", "Loaded valid token from session store");
            this.cachedToken = storedToken;
            return storedToken;
        }
        (0, logger_js_1.log)("DEBUG", "No valid token available");
        return null;
    }
    /**
     * Set a new token, caching in memory and persisting to disk.
     */
    async setToken(token) {
        this.cachedToken = token;
        await this.sessionStore.save(token);
        (0, logger_js_1.log)("DEBUG", "Token cached and persisted");
    }
    /**
     * Clear the token from memory and disk.
     */
    async clearToken() {
        this.cachedToken = null;
        await this.sessionStore.clear();
        (0, logger_js_1.log)("DEBUG", "Token cleared from memory and disk");
    }
    /**
     * Check if a token is valid (not expired and outside refresh buffer).
     * A token is valid if it expires more than REFRESH_BUFFER_MS from now.
     */
    isValid(token) {
        const now = Date.now();
        const timeUntilExpiry = token.expiresAt - now;
        // Token must expire more than REFRESH_BUFFER_MS in the future
        const valid = timeUntilExpiry > REFRESH_BUFFER_MS;
        if (!valid) {
            (0, logger_js_1.log)("DEBUG", `Token invalid: expires in ${Math.round(timeUntilExpiry / 1000)}s (buffer: ${REFRESH_BUFFER_MS / 1000}s)`);
        }
        return valid;
    }
    /**
     * Check if a token refresh is needed.
     * Returns true if no valid token is available.
     */
    async needsRefresh() {
        const token = await this.getToken();
        return token === null;
    }
}
exports.TokenManager = TokenManager;
//# sourceMappingURL=token-manager.js.map