"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CACHE_TTLS = void 0;
// Default TTL values per user decision
exports.DEFAULT_CACHE_TTLS = {
    enrollments: 3_600_000, // 1 hour
    courseContent: 1_800_000, // 30 min
    announcements: 300_000, // 5 min
    grades: 120_000, // 2 min
    assignments: 600_000, // 10 min
    roster: 3_600_000, // 1 hour
    profile: 3_600_000, // 1 hour
};
//# sourceMappingURL=types.js.map