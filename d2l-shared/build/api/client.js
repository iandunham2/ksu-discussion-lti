"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.D2LApiClient = void 0;
const types_js_1 = require("./types.js");
const cache_js_1 = require("./cache.js");
const rate_limiter_js_1 = require("./rate-limiter.js");
const version_discovery_js_1 = require("./version-discovery.js");
const errors_js_1 = require("./errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * D2L API client with authentication, caching, rate limiting, and version discovery.
 *
 * Key features:
 * - Auto-discovers LP/LE versions from /d2l/api/versions/
 * - Supports both Bearer tokens and cookie-based auth (auto-detected via "cookie:" prefix)
 * - Client-side rate limiting using token bucket algorithm
 * - In-memory response caching with per-data-type TTLs
 * - 401 retry logic: retry once with fresh token, then clear and throw
 * - HTTPS-only enforcement
 * - Browser-like User-Agent for requests
 * - Raw response passthrough (no transformation)
 */
class D2LApiClient {
    baseUrl;
    tokenManager;
    cache;
    rateLimiter;
    cacheTTLs;
    timeoutMs;
    onAuthExpired;
    versions = null;
    constructor(options) {
        // HTTPS-only enforcement
        if (options.baseUrl.startsWith("http://")) {
            throw new Error("HTTPS is required for D2L API client. HTTP URLs are not allowed for security reasons.");
        }
        // Strip trailing slash from baseUrl
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.tokenManager = options.tokenManager;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.onAuthExpired = options.onAuthExpired;
        // Merge user-provided TTLs with defaults
        this.cacheTTLs = { ...types_js_1.DEFAULT_CACHE_TTLS, ...options.cacheTTLs };
        // Initialize cache and rate limiter
        this.cache = new cache_js_1.TTLCache();
        const rateLimitConfig = options.rateLimitConfig ?? {
            capacity: 10,
            refillRate: 3,
        };
        this.rateLimiter = new rate_limiter_js_1.TokenBucket(rateLimitConfig.capacity, rateLimitConfig.refillRate);
        (0, logger_js_1.log)("DEBUG", `D2LApiClient initialized for ${this.baseUrl}`);
    }
    /**
     * Initialize the client by discovering API versions.
     * Must be called before making API requests.
     */
    async initialize() {
        this.versions = await (0, version_discovery_js_1.discoverVersions)(this.baseUrl, this.timeoutMs);
        (0, logger_js_1.log)("INFO", `D2L API versions discovered: LP ${this.versions.lp}, LE ${this.versions.le}`);
    }
    /**
     * Get discovered API versions.
     * @throws Error if initialize() hasn't been called yet
     */
    get apiVersions() {
        if (!this.versions) {
            throw new Error("API client not initialized. Call initialize() before accessing apiVersions.");
        }
        return this.versions;
    }
    /**
     * Make a GET request to the D2L API.
     *
     * @param path - API path (e.g., "/d2l/api/lp/1.56/users/whoami")
     * @param options - Request options (ttl for caching)
     * @returns Parsed JSON response (raw, no transformation)
     * @throws ApiError on HTTP errors (401, 403, 429, etc.)
     * @throws NetworkError on network/fetch failures
     */
    async get(path, options) {
        // Check cache first
        if (options?.ttl && this.cache.has(path)) {
            (0, logger_js_1.log)("DEBUG", `Cache hit: ${path}`);
            return this.cache.get(path);
        }
        // Enforce rate limit
        await this.rateLimiter.consume();
        // Get authentication token — auto-reauth if expired
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        // Make request with retry logic
        try {
            return await this.makeRequest(path, token, options);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                // Final attempt: auto-reauth and retry once
                const freshToken = await this.tryAutoReauth(path);
                return await this.makeRequest(path, freshToken, options);
            }
            throw error;
        }
    }
    /**
     * Make a GET request to the D2L API and return raw Response object.
     * Used for binary file downloads where JSON parsing is not desired.
     * Does NOT cache responses (file downloads shouldn't be cached).
     *
     * @param path - API path (e.g., "/d2l/api/le/1.91/123456/content/topics/789/file")
     * @returns Raw Response object for binary data extraction
     * @throws ApiError on HTTP errors (401, 403, 429, etc.)
     * @throws NetworkError on network/fetch failures
     */
    async getRaw(path) {
        // Enforce rate limit
        await this.rateLimiter.consume();
        // Get authentication token — auto-reauth if expired
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        // Make request with retry logic
        try {
            return await this.makeRawRequest(path, token);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                // Final attempt: auto-reauth and retry once
                const freshToken = await this.tryAutoReauth(path);
                return await this.makeRawRequest(path, freshToken);
            }
            throw error;
        }
    }
    /**
     * Attempt auto-reauthentication via the onAuthExpired callback.
     * If successful, returns the fresh token. Otherwise throws 401 ApiError.
     */
    async tryAutoReauth(path) {
        if (this.onAuthExpired) {
            (0, logger_js_1.log)("INFO", "Attempting auto-reauthentication...");
            const success = await this.onAuthExpired();
            if (success) {
                const freshToken = await this.tokenManager.getToken();
                if (freshToken) {
                    (0, logger_js_1.log)("INFO", "Auto-reauthentication succeeded, retrying request");
                    return freshToken;
                }
            }
            (0, logger_js_1.log)("WARN", "Auto-reauthentication did not produce a valid token");
        }
        throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
    }
    /**
     * Internal method to make HTTP request with 401 retry logic.
     */
    async makeRequest(path, token, options, isRetry = false) {
        const url = `${this.baseUrl}${path}`;
        const headers = this.buildAuthHeaders(token);
        try {
            (0, logger_js_1.log)("DEBUG", `${isRetry ? "Retrying" : "Requesting"} GET ${path}`);
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            // Handle 401 with retry logic
            if (response.status === 401) {
                if (isRetry) {
                    // Second 401 - clear token and throw
                    (0, logger_js_1.log)("DEBUG", "Second 401 response, clearing token");
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                // First 401 - try to get fresher token
                (0, logger_js_1.log)("DEBUG", "First 401 response, attempting retry with fresh token");
                const freshToken = await this.tokenManager.getToken();
                if (!freshToken || freshToken.accessToken === token.accessToken) {
                    // No fresher token available
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                // Retry with fresh token
                return await this.makeRequest(path, freshToken, options, true);
            }
            // Handle 429 rate limiting
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
                throw new errors_js_1.RateLimitError(path, retryAfterSeconds);
            }
            // Handle 403 (common for past-semester courses)
            if (response.status === 403) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(403, path, responseText);
            }
            // Handle other non-OK responses
            if (!response.ok) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(response.status, path, responseText);
            }
            // Parse and cache response
            const data = await response.json();
            if (options?.ttl) {
                this.cache.set(path, data, options.ttl);
                (0, logger_js_1.log)("DEBUG", `Cached response for ${path} (TTL: ${options.ttl}ms)`);
            }
            return data;
        }
        catch (error) {
            // Re-throw our own errors
            if (error instanceof errors_js_1.ApiError ||
                error instanceof errors_js_1.RateLimitError ||
                error instanceof errors_js_1.NetworkError) {
                throw error;
            }
            // Wrap network/fetch errors
            const message = error instanceof Error ? error.message : String(error);
            throw new errors_js_1.NetworkError(`Request to ${path} failed: ${message}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Internal method to make HTTP request for raw binary data with 401 retry logic.
     */
    async makeRawRequest(path, token, isRetry = false) {
        const url = `${this.baseUrl}${path}`;
        const headers = this.buildAuthHeaders(token);
        try {
            (0, logger_js_1.log)("DEBUG", `${isRetry ? "Retrying" : "Requesting"} GET ${path} (raw)`);
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            // Handle 401 with retry logic
            if (response.status === 401) {
                if (isRetry) {
                    // Second 401 - clear token and throw
                    (0, logger_js_1.log)("DEBUG", "Second 401 response, clearing token");
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                // First 401 - try to get fresher token
                (0, logger_js_1.log)("DEBUG", "First 401 response, attempting retry with fresh token");
                const freshToken = await this.tokenManager.getToken();
                if (!freshToken || freshToken.accessToken === token.accessToken) {
                    // No fresher token available
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                // Retry with fresh token
                return await this.makeRawRequest(path, freshToken, true);
            }
            // Handle 429 rate limiting
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
                throw new errors_js_1.RateLimitError(path, retryAfterSeconds);
            }
            // Handle 403 (common for past-semester courses or no access)
            if (response.status === 403) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(403, path, responseText);
            }
            // Handle 404 (file not found)
            if (response.status === 404) {
                throw new errors_js_1.ApiError(404, path, "File not found");
            }
            // Handle other non-OK responses
            if (!response.ok) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(response.status, path, responseText);
            }
            // Return raw response for caller to process
            return response;
        }
        catch (error) {
            // Re-throw our own errors
            if (error instanceof errors_js_1.ApiError ||
                error instanceof errors_js_1.RateLimitError ||
                error instanceof errors_js_1.NetworkError) {
                throw error;
            }
            // Wrap network/fetch errors
            const message = error instanceof Error ? error.message : String(error);
            throw new errors_js_1.NetworkError(`Request to ${path} failed: ${message}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Build authentication headers for a request.
     * Supports both Bearer tokens and cookie-based auth.
     */
    // Cached XSRF token for cookie-based write requests
    xsrfToken = null;
    buildAuthHeaders(token) {
        const headers = {
            "User-Agent": "BrightspaceMCP/1.0 (Rohan Muppa; github.com/rohanmuppa/brightspace-mcp-server)",
        };
        // Auto-detect cookie vs Bearer auth based on "cookie:" prefix
        if (token.accessToken.startsWith("cookie:")) {
            // Cookie-based auth: strip prefix and set Cookie header
            headers["Cookie"] = token.accessToken.substring(7);
            (0, logger_js_1.log)("DEBUG", "Using cookie-based authentication");
        }
        else {
            // Bearer token auth
            headers["Authorization"] = `Bearer ${token.accessToken}`;
            (0, logger_js_1.log)("DEBUG", "Using Bearer token authentication");
        }
        return headers;
    }
    /**
     * Fetch XSRF token required for cookie-based write requests.
     * D2L rejects POST/PUT/DELETE with session cookies unless an XSRF token is present.
     */
    async getXsrfToken(token) {
        if (!token.accessToken.startsWith("cookie:"))
            return null;
        if (this.xsrfToken)
            return this.xsrfToken;
        try {
            const url = `${this.baseUrl}/d2l/lp/auth/xsrf-tokens`;
            const headers = this.buildAuthHeaders(token);
            const response = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(10000),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.referrerToken) {
                    this.xsrfToken = data.referrerToken;
                    (0, logger_js_1.log)("DEBUG", "XSRF token acquired for cookie-based writes");
                    return this.xsrfToken;
                }
            }
            (0, logger_js_1.log)("WARN", `Failed to fetch XSRF token: HTTP ${response.status}`);
            return null;
        }
        catch (error) {
            (0, logger_js_1.log)("WARN", "Failed to fetch XSRF token", error);
            return null;
        }
    }
    /**
     * Add XSRF token header to request headers if using cookie-based auth.
     */
    applyXsrf(headers, xsrfToken) {
        if (xsrfToken) {
            headers["X-Csrf-Token"] = xsrfToken;
        }
    }
    /**
     * Build path for LP (Learning Platform) API endpoints.
     * @param path - Path within LP API (e.g., "/users/whoami")
     * @returns Full versioned path (e.g., "/d2l/api/lp/1.56/users/whoami")
     */
    lp(path) {
        const { lp } = this.apiVersions;
        return `/d2l/api/lp/${lp}${path}`;
    }
    /**
     * Build path for LE (Learning Environment) API endpoints with orgUnitId.
     * @param orgUnitId - Organizational unit ID (course ID)
     * @param path - Path within LE API (e.g., "/content/root/")
     * @returns Full versioned path (e.g., "/d2l/api/le/1.91/123456/content/root/")
     */
    le(orgUnitId, path) {
        const { le } = this.apiVersions;
        return `/d2l/api/le/${le}/${orgUnitId}${path}`;
    }
    /**
     * Build path for global LE (Learning Environment) API endpoints without orgUnitId.
     * @param path - Path within LE API (e.g., "/enrollments/myenrollments/")
     * @returns Full versioned path (e.g., "/d2l/api/le/1.91/enrollments/myenrollments/")
     */
    leGlobal(path) {
        const { le } = this.apiVersions;
        return `/d2l/api/le/${le}${path}`;
    }
    /**
     * Make a POST request to the D2L API.
     *
     * @param path - API path
     * @param body - JSON body to send
     * @returns Parsed JSON response
     */
    async post(path, body) {
        await this.rateLimiter.consume();
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        try {
            return await this.makeWriteRequest("POST", path, token, body);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                const freshToken = await this.tryAutoReauth(path);
                return await this.makeWriteRequest("POST", path, freshToken, body);
            }
            throw error;
        }
    }
    /**
     * Make a PUT request to the D2L API.
     *
     * @param path - API path
     * @param body - JSON body to send
     * @returns Parsed JSON response
     */
    async put(path, body) {
        await this.rateLimiter.consume();
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        try {
            return await this.makeWriteRequest("PUT", path, token, body);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                const freshToken = await this.tryAutoReauth(path);
                return await this.makeWriteRequest("PUT", path, freshToken, body);
            }
            throw error;
        }
    }
    /**
     * Make a DELETE request to the D2L API.
     *
     * @param path - API path
     */
    async delete(path) {
        await this.rateLimiter.consume();
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        try {
            await this.makeDeleteRequest(path, token);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                const freshToken = await this.tryAutoReauth(path);
                await this.makeDeleteRequest(path, freshToken);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Make a multipart POST request to the D2L API (for file uploads).
     *
     * @param path - API path
     * @param formData - FormData with file content
     * @returns Parsed JSON response
     */
    async postMultipart(path, formData) {
        await this.rateLimiter.consume();
        let token = await this.tokenManager.getToken();
        if (!token) {
            token = await this.tryAutoReauth(path);
        }
        try {
            return await this.makeMultipartRequest(path, token, formData);
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError && error.status === 401) {
                const freshToken = await this.tryAutoReauth(path);
                return await this.makeMultipartRequest(path, freshToken, formData);
            }
            throw error;
        }
    }
    /**
     * Internal method to make write (POST/PUT) requests with JSON body.
     */
    async makeWriteRequest(method, path, token, body, isRetry = false) {
        const xsrf = await this.getXsrfToken(token);
        const url = `${this.baseUrl}${path}`;
        const headers = {
            ...this.buildAuthHeaders(token),
            "Content-Type": "application/json",
        };
        this.applyXsrf(headers, xsrf);
        try {
            (0, logger_js_1.log)("DEBUG", `${isRetry ? "Retrying" : "Requesting"} ${method} ${path}`);
            const response = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (response.status === 401) {
                if (isRetry) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                const freshToken = await this.tokenManager.getToken();
                if (!freshToken || freshToken.accessToken === token.accessToken) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                return await this.makeWriteRequest(method, path, freshToken, body, true);
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                throw new errors_js_1.RateLimitError(path, retryAfter ? parseInt(retryAfter, 10) : undefined);
            }
            if (response.status === 403) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(403, path, responseText);
            }
            if (!response.ok) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(response.status, path, responseText);
            }
            // Some endpoints return 200/201 with body, some return 204 no content
            const contentType = response.headers.get("Content-Type") ?? "";
            // D2L returns 200 with text/html containing a redirect to /d2l/login?sessionExpired=1
            // when session cookies expire — treat this as a 401
            if (contentType.includes("text/html")) {
                const htmlBody = await response.text();
                if (htmlBody.includes("sessionExpired")) {
                    (0, logger_js_1.log)("WARN", `${method} ${path}: D2L returned session-expired HTML redirect`);
                    this.xsrfToken = null; // Clear stale XSRF token
                    if (isRetry) {
                        await this.tokenManager.clearToken();
                        throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                    }
                    throw new errors_js_1.ApiError(401, path, "Session expired (HTML redirect).");
                }
                return undefined;
            }
            if (response.status === 204 || !contentType.includes("application/json")) {
                return undefined;
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError || error instanceof errors_js_1.RateLimitError || error instanceof errors_js_1.NetworkError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new errors_js_1.NetworkError(`${method} request to ${path} failed: ${message}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Internal method to make DELETE requests.
     */
    async makeDeleteRequest(path, token, isRetry = false) {
        const xsrf = await this.getXsrfToken(token);
        const url = `${this.baseUrl}${path}`;
        const headers = this.buildAuthHeaders(token);
        this.applyXsrf(headers, xsrf);
        try {
            (0, logger_js_1.log)("DEBUG", `${isRetry ? "Retrying" : "Requesting"} DELETE ${path}`);
            const response = await fetch(url, {
                method: "DELETE",
                headers,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (response.status === 401) {
                if (isRetry) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                const freshToken = await this.tokenManager.getToken();
                if (!freshToken || freshToken.accessToken === token.accessToken) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                return await this.makeDeleteRequest(path, freshToken, true);
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                throw new errors_js_1.RateLimitError(path, retryAfter ? parseInt(retryAfter, 10) : undefined);
            }
            if (!response.ok && response.status !== 204) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(response.status, path, responseText);
            }
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError || error instanceof errors_js_1.RateLimitError || error instanceof errors_js_1.NetworkError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new errors_js_1.NetworkError(`DELETE request to ${path} failed: ${message}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Internal method to make multipart/form-data POST requests (for file uploads).
     */
    async makeMultipartRequest(path, token, formData, isRetry = false) {
        const xsrf = await this.getXsrfToken(token);
        const url = `${this.baseUrl}${path}`;
        // Do NOT set Content-Type — fetch sets it with boundary automatically for FormData
        const headers = this.buildAuthHeaders(token);
        this.applyXsrf(headers, xsrf);
        try {
            (0, logger_js_1.log)("DEBUG", `${isRetry ? "Retrying" : "Requesting"} POST (multipart) ${path}`);
            const response = await fetch(url, {
                method: "POST",
                headers,
                body: formData,
                signal: AbortSignal.timeout(this.timeoutMs * 3), // longer timeout for uploads
            });
            if (response.status === 401) {
                if (isRetry) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                const freshToken = await this.tokenManager.getToken();
                if (!freshToken || freshToken.accessToken === token.accessToken) {
                    await this.tokenManager.clearToken();
                    throw new errors_js_1.ApiError(401, path, "Session expired. Please re-authenticate via brightspace-auth.");
                }
                return await this.makeMultipartRequest(path, freshToken, formData, true);
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                throw new errors_js_1.RateLimitError(path, retryAfter ? parseInt(retryAfter, 10) : undefined);
            }
            if (!response.ok) {
                const responseText = await response.text();
                throw new errors_js_1.ApiError(response.status, path, responseText);
            }
            const contentType = response.headers.get("Content-Type") ?? "";
            if (response.status === 204 || !contentType.includes("application/json")) {
                return undefined;
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof errors_js_1.ApiError || error instanceof errors_js_1.RateLimitError || error instanceof errors_js_1.NetworkError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new errors_js_1.NetworkError(`Multipart POST to ${path} failed: ${message}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Clear all cached responses.
     */
    clearCache() {
        this.cache.clear();
        (0, logger_js_1.log)("DEBUG", "Cache cleared");
    }
    /**
     * Get current cache size (number of cached entries).
     */
    get cacheSize() {
        return this.cache.size;
    }
}
exports.D2LApiClient = D2LApiClient;
//# sourceMappingURL=client.js.map