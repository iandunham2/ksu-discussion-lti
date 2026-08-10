/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import type { TokenData } from "../types/index.js";
/**
 * TokenManager manages token lifecycle with in-memory caching and disk persistence.
 * Handles expiry detection with a configurable refresh buffer.
 */
export declare class TokenManager {
    private cachedToken;
    private readonly sessionStore;
    constructor(sessionDir?: string);
    /**
     * Get the current token if valid, otherwise null.
     * Checks memory cache first, then loads from disk if needed.
     * Returns null if token is expired or within refresh buffer.
     */
    getToken(): Promise<TokenData | null>;
    /**
     * Set a new token, caching in memory and persisting to disk.
     */
    setToken(token: TokenData): Promise<void>;
    /**
     * Clear the token from memory and disk.
     */
    clearToken(): Promise<void>;
    /**
     * Check if a token is valid (not expired and outside refresh buffer).
     * A token is valid if it expires more than REFRESH_BUFFER_MS from now.
     */
    isValid(token: TokenData): boolean;
    /**
     * Check if a token refresh is needed.
     * Returns true if no valid token is available.
     */
    needsRefresh(): Promise<boolean>;
}
//# sourceMappingURL=token-manager.d.ts.map