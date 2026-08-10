"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverVersions = discoverVersions;
const errors_js_1 = require("./errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Auto-discover D2L API versions from the public /d2l/api/versions/ endpoint.
 *
 * @param baseUrl - Base URL of the D2L instance (e.g., "https://purdue.brightspace.com")
 * @param timeoutMs - Request timeout in milliseconds (default: 15000)
 * @returns Object with discovered LP and LE versions
 * @throws NetworkError if fetch fails or versions cannot be parsed
 */
async function discoverVersions(baseUrl, timeoutMs = 15000) {
    const url = `${baseUrl}/d2l/api/versions/`;
    try {
        (0, logger_js_1.log)("DEBUG", `Discovering API versions from ${url}`);
        const response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                // Browser-like User-Agent for version discovery
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
        });
        if (!response.ok) {
            throw new errors_js_1.NetworkError(`Version discovery failed with status ${response.status}`);
        }
        const versions = await response.json();
        // Find LP (Learning Platform) and LE (Learning Environment) versions
        const lpEntry = versions.find(v => v.ProductCode === "lp");
        const leEntry = versions.find(v => v.ProductCode === "le");
        if (!lpEntry) {
            throw new errors_js_1.NetworkError("LP (Learning Platform) version not found in /d2l/api/versions/ response");
        }
        if (!leEntry) {
            throw new errors_js_1.NetworkError("LE (Learning Environment) version not found in /d2l/api/versions/ response");
        }
        const result = {
            lp: lpEntry.LatestVersion,
            le: leEntry.LatestVersion,
        };
        (0, logger_js_1.log)("INFO", `Discovered API versions: LP ${result.lp}, LE ${result.le}`);
        return result;
    }
    catch (error) {
        if (error instanceof errors_js_1.NetworkError) {
            throw error;
        }
        // Wrap other errors (timeout, network failures, JSON parse errors)
        const message = error instanceof Error ? error.message : String(error);
        throw new errors_js_1.NetworkError(`Failed to discover API versions: ${message}`, error instanceof Error ? error : undefined);
    }
}
//# sourceMappingURL=version-discovery.js.map