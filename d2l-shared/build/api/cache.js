"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTLCache = void 0;
class TTLCache {
    cache = new Map();
    set(key, value, ttlMs) {
        // Clear existing timer if key exists
        const existing = this.cache.get(key);
        if (existing) {
            clearTimeout(existing.timerId);
        }
        // Set new timer to auto-delete after TTL
        const timerId = setTimeout(() => {
            this.cache.delete(key);
        }, ttlMs);
        // Store entry
        this.cache.set(key, { data: value, timerId });
    }
    get(key) {
        const entry = this.cache.get(key);
        return entry?.data;
    }
    has(key) {
        return this.cache.has(key);
    }
    delete(key) {
        const entry = this.cache.get(key);
        if (entry) {
            clearTimeout(entry.timerId);
            this.cache.delete(key);
            return true;
        }
        return false;
    }
    clear() {
        // Clear all timers
        for (const entry of this.cache.values()) {
            clearTimeout(entry.timerId);
        }
        // Clear map
        this.cache.clear();
    }
    get size() {
        return this.cache.size;
    }
}
exports.TTLCache = TTLCache;
//# sourceMappingURL=cache.js.map