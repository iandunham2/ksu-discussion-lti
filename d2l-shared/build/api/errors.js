"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkError = exports.RateLimitError = exports.HttpError = exports.ApiError = void 0;
const errors_js_1 = require("../utils/errors.js");
// Base class for all HTTP API errors
class ApiError extends errors_js_1.AuthError {
    status;
    endpoint;
    responseBody;
    constructor(status, endpoint, message, responseBody, cause) {
        super(`[PBMCP-2001] API error (${status}) at ${endpoint}: ${message}`, cause);
        this.status = status;
        this.endpoint = endpoint;
        this.responseBody = responseBody;
        this.name = "ApiError";
    }
}
exports.ApiError = ApiError;
// Generic HTTP error (non-401/429) - semantic alias for ApiError
class HttpError extends ApiError {
    constructor(status, endpoint, message, responseBody, cause) {
        super(status, endpoint, message, responseBody, cause);
        this.name = "HttpError";
    }
}
exports.HttpError = HttpError;
// Rate limit error (429 Too Many Requests)
class RateLimitError extends ApiError {
    retryAfter;
    constructor(endpoint, retryAfter) {
        const message = retryAfter
            ? `[PBMCP-2002] Rate limited, retry after ${retryAfter}s`
            : "[PBMCP-2002] Rate limited";
        super(429, endpoint, message);
        this.retryAfter = retryAfter;
        this.name = "RateLimitError";
    }
}
exports.RateLimitError = RateLimitError;
// Network-level error (no HTTP status code)
// For fetch failures, timeouts, DNS errors
class NetworkError extends errors_js_1.AuthError {
    constructor(message, cause) {
        super(`[PBMCP-2003] Network error: ${message}`, cause);
        this.name = "NetworkError";
    }
}
exports.NetworkError = NetworkError;
//# sourceMappingURL=errors.js.map