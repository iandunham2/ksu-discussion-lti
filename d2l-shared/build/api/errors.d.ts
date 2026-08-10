/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import { AuthError } from "../utils/errors.js";
export declare class ApiError extends AuthError {
    readonly status: number;
    readonly endpoint: string;
    readonly responseBody?: string | undefined;
    constructor(status: number, endpoint: string, message: string, responseBody?: string | undefined, cause?: Error);
}
export declare class HttpError extends ApiError {
    constructor(status: number, endpoint: string, message: string, responseBody?: string, cause?: Error);
}
export declare class RateLimitError extends ApiError {
    readonly retryAfter?: number | undefined;
    constructor(endpoint: string, retryAfter?: number | undefined);
}
export declare class NetworkError extends AuthError {
    constructor(message: string, cause?: Error);
}
//# sourceMappingURL=errors.d.ts.map