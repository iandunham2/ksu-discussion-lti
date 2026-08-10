/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
export declare class TTLCache<T = unknown> {
    private cache;
    set(key: string, value: T, ttlMs: number): void;
    get(key: string): T | undefined;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=cache.d.ts.map