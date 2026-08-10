/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import type { D2LApiClientOptions, ApiVersions } from "./types.js";
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
export declare class D2LApiClient {
    private readonly baseUrl;
    private readonly tokenManager;
    private readonly cache;
    private readonly rateLimiter;
    private readonly cacheTTLs;
    private readonly timeoutMs;
    private readonly onAuthExpired?;
    private versions;
    constructor(options: D2LApiClientOptions);
    /**
     * Initialize the client by discovering API versions.
     * Must be called before making API requests.
     */
    initialize(): Promise<void>;
    /**
     * Get discovered API versions.
     * @throws Error if initialize() hasn't been called yet
     */
    get apiVersions(): ApiVersions;
    /**
     * Make a GET request to the D2L API.
     *
     * @param path - API path (e.g., "/d2l/api/lp/1.56/users/whoami")
     * @param options - Request options (ttl for caching)
     * @returns Parsed JSON response (raw, no transformation)
     * @throws ApiError on HTTP errors (401, 403, 429, etc.)
     * @throws NetworkError on network/fetch failures
     */
    get<T>(path: string, options?: {
        ttl?: number;
    }): Promise<T>;
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
    getRaw(path: string): Promise<Response>;
    /**
     * Attempt auto-reauthentication via the onAuthExpired callback.
     * If successful, returns the fresh token. Otherwise throws 401 ApiError.
     */
    private tryAutoReauth;
    /**
     * Internal method to make HTTP request with 401 retry logic.
     */
    private makeRequest;
    /**
     * Internal method to make HTTP request for raw binary data with 401 retry logic.
     */
    private makeRawRequest;
    /**
     * Build authentication headers for a request.
     * Supports both Bearer tokens and cookie-based auth.
     */
    private xsrfToken;
    private buildAuthHeaders;
    /**
     * Fetch XSRF token required for cookie-based write requests.
     * D2L rejects POST/PUT/DELETE with session cookies unless an XSRF token is present.
     */
    private getXsrfToken;
    /**
     * Add XSRF token header to request headers if using cookie-based auth.
     */
    private applyXsrf;
    /**
     * Build path for LP (Learning Platform) API endpoints.
     * @param path - Path within LP API (e.g., "/users/whoami")
     * @returns Full versioned path (e.g., "/d2l/api/lp/1.56/users/whoami")
     */
    lp(path: string): string;
    /**
     * Build path for LE (Learning Environment) API endpoints with orgUnitId.
     * @param orgUnitId - Organizational unit ID (course ID)
     * @param path - Path within LE API (e.g., "/content/root/")
     * @returns Full versioned path (e.g., "/d2l/api/le/1.91/123456/content/root/")
     */
    le(orgUnitId: number, path: string): string;
    /**
     * Build path for global LE (Learning Environment) API endpoints without orgUnitId.
     * @param path - Path within LE API (e.g., "/enrollments/myenrollments/")
     * @returns Full versioned path (e.g., "/d2l/api/le/1.91/enrollments/myenrollments/")
     */
    leGlobal(path: string): string;
    /**
     * Make a POST request to the D2L API.
     *
     * @param path - API path
     * @param body - JSON body to send
     * @returns Parsed JSON response
     */
    post<T>(path: string, body: unknown): Promise<T>;
    /**
     * Make a PUT request to the D2L API.
     *
     * @param path - API path
     * @param body - JSON body to send
     * @returns Parsed JSON response
     */
    put<T>(path: string, body: unknown): Promise<T>;
    /**
     * Make a DELETE request to the D2L API.
     *
     * @param path - API path
     */
    delete(path: string): Promise<void>;
    /**
     * Make a multipart POST request to the D2L API (for file uploads).
     *
     * @param path - API path
     * @param formData - FormData with file content
     * @returns Parsed JSON response
     */
    postMultipart<T>(path: string, formData: FormData): Promise<T>;
    /**
     * Internal method to make write (POST/PUT) requests with JSON body.
     */
    private makeWriteRequest;
    /**
     * Internal method to make DELETE requests.
     */
    private makeDeleteRequest;
    /**
     * Internal method to make multipart/form-data POST requests (for file uploads).
     */
    private makeMultipartRequest;
    /**
     * Clear all cached responses.
     */
    clearCache(): void;
    /**
     * Get current cache size (number of cached entries).
     */
    get cacheSize(): number;
}
//# sourceMappingURL=client.d.ts.map