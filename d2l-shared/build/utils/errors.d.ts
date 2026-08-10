/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
export declare class AuthError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
export declare class TokenExpiredError extends AuthError {
    readonly expiredAt: number;
    constructor(expiredAt: number);
}
export declare class BrowserAuthError extends AuthError {
    readonly step: string;
    constructor(message: string, step: string, cause?: Error);
}
export declare class SessionStoreError extends AuthError {
    constructor(message: string, cause?: Error);
}
//# sourceMappingURL=errors.d.ts.map