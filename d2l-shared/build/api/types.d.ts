/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import type { TokenData } from "../types/index.js";
import type { TokenManager } from "../auth/token-manager.js";
export interface ApiVersions {
    lp: string;
    le: string;
}
export interface CacheTTLs {
    enrollments: number;
    courseContent: number;
    announcements: number;
    grades: number;
    assignments: number;
    roster: number;
    profile: number;
}
export declare const DEFAULT_CACHE_TTLS: CacheTTLs;
export interface RateLimitConfig {
    capacity: number;
    refillRate: number;
}
export interface D2LApiClientOptions {
    baseUrl: string;
    tokenManager: TokenManager;
    cacheTTLs?: Partial<CacheTTLs>;
    rateLimitConfig?: RateLimitConfig;
    timeoutMs?: number;
    /** Called when auth is expired and retries are exhausted. Return true if re-auth succeeded. */
    onAuthExpired?: () => Promise<boolean>;
}
export type { TokenData };
//# sourceMappingURL=types.d.ts.map