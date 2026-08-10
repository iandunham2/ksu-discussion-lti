/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
import type { ApiVersions } from "./types.js";
/**
 * Auto-discover D2L API versions from the public /d2l/api/versions/ endpoint.
 *
 * @param baseUrl - Base URL of the D2L instance (e.g., "https://purdue.brightspace.com")
 * @param timeoutMs - Request timeout in milliseconds (default: 15000)
 * @returns Object with discovered LP and LE versions
 * @throws NetworkError if fetch fails or versions cannot be parsed
 */
export declare function discoverVersions(baseUrl: string, timeoutMs?: number): Promise<ApiVersions>;
//# sourceMappingURL=version-discovery.d.ts.map