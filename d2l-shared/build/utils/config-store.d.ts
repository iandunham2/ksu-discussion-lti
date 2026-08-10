/**
 * Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
/** JSON schema for ~/.brightspace-mcp/config.json */
export interface ConfigStoreData {
    baseUrl?: string;
    username?: string;
    password?: string;
    sessionDir?: string;
    tokenTtl?: number;
    headless?: boolean;
    includeCourses?: number[];
    excludeCourses?: number[];
    activeOnly?: boolean;
}
export declare function configStoreExists(): boolean;
export declare function loadConfigStore(): ConfigStoreData;
export declare function saveConfigStore(config: ConfigStoreData): void;
export declare function getConfigStorePath(): string;
//# sourceMappingURL=config-store.d.ts.map