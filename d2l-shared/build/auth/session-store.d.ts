/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import type { TokenData } from "../types/index.js";
/**
 * SessionStore manages encrypted token persistence to disk.
 * Uses AES-256-GCM for encryption with a key derived from username + hostname.
 */
export declare class SessionStore {
    private readonly sessionDir;
    private readonly sessionFilePath;
    constructor(sessionDir?: string);
    /**
     * Get or create a random salt unique to this installation.
     * Stored at ~/.d2l-session/salt with restricted permissions.
     */
    private getOrCreateSalt;
    /**
     * Derive AES-256 key from username and hostname using scrypt.
     * Uses a per-installation random salt to prevent precomputation attacks.
     */
    private deriveKey;
    /**
     * Encrypt plaintext using AES-256-GCM.
     * Returns IV, auth tag, and ciphertext as hex strings.
     */
    private encrypt;
    /**
     * Decrypt ciphertext using AES-256-GCM.
     * Returns plaintext string, or throws if auth tag verification fails.
     */
    private decrypt;
    /**
     * Save token to disk with encryption.
     * Creates session directory if it doesn't exist.
     */
    save(token: TokenData): Promise<void>;
    /**
     * Load token from disk with decryption.
     * Returns null if file doesn't exist or is corrupted (graceful degradation).
     */
    load(): Promise<TokenData | null>;
    /**
     * Clear session by deleting the session file.
     */
    clear(): Promise<void>;
}
//# sourceMappingURL=session-store.d.ts.map