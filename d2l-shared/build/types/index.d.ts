/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
export interface TokenData {
    accessToken: string;
    capturedAt: number;
    expiresAt: number;
    source: "browser" | "cache";
}
export interface EncryptedData {
    iv: string;
    authTag: string;
    data: string;
}
export interface SessionFile {
    version: 1;
    encrypted: EncryptedData;
    createdAt: number;
    expiresAt: number;
}
export interface AppConfig {
    baseUrl: string;
    sessionDir: string;
    tokenTtl: number;
    headless: boolean;
    username?: string;
    password?: string;
    courseFilter: CourseFilterConfig;
}
export interface AuthResult {
    token: TokenData;
    cookies?: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
    }>;
}
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export interface CourseFilterConfig {
    includeCourseIds?: number[];
    excludeCourseIds?: number[];
    activeOnly: boolean;
}
//# sourceMappingURL=index.d.ts.map