/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
export declare class TokenBucket {
    private tokens;
    private lastRefill;
    private readonly capacity;
    private readonly refillRate;
    constructor(capacity: number, refillRate: number);
    private refill;
    consume(count?: number): Promise<void>;
    tryConsume(count?: number): boolean;
    get availableTokens(): number;
}
//# sourceMappingURL=rate-limiter.d.ts.map