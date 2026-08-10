"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStoreError = exports.BrowserAuthError = exports.TokenExpiredError = exports.AuthError = void 0;
class AuthError extends Error {
    cause;
    constructor(message, cause) {
        super(`[PBMCP-1001] ${message}`);
        this.cause = cause;
        this.name = "AuthError";
    }
}
exports.AuthError = AuthError;
class TokenExpiredError extends AuthError {
    expiredAt;
    constructor(expiredAt) {
        super(`[PBMCP-1002] Token expired at ${new Date(expiredAt).toISOString()}`);
        this.expiredAt = expiredAt;
        this.name = "TokenExpiredError";
    }
}
exports.TokenExpiredError = TokenExpiredError;
class BrowserAuthError extends AuthError {
    step;
    constructor(message, step, cause) {
        super(`[PBMCP-1003] Browser auth failed at step "${step}": ${message}`, cause);
        this.step = step;
        this.name = "BrowserAuthError";
    }
}
exports.BrowserAuthError = BrowserAuthError;
class SessionStoreError extends AuthError {
    constructor(message, cause) {
        super(`[PBMCP-1004] Session store error: ${message}`, cause);
        this.name = "SessionStoreError";
    }
}
exports.SessionStoreError = SessionStoreError;
//# sourceMappingURL=errors.js.map