"use strict";
/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBucket = void 0;
// Token bucket rate limiter - allows bursts up to capacity
// Conservative defaults: capacity 10, refill 3/sec
class TokenBucket {
    tokens;
    lastRefill;
    capacity;
    refillRate; // tokens per second
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.tokens = capacity; // Start with full bucket
        this.lastRefill = Date.now();
    }
    refill() {
        const now = Date.now();
        const elapsedMs = now - this.lastRefill;
        const elapsedSeconds = elapsedMs / 1000;
        // Add tokens based on elapsed time
        const tokensToAdd = elapsedSeconds * this.refillRate;
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }
    async consume(count = 1) {
        this.refill();
        if (this.tokens >= count) {
            // Enough tokens available - consume immediately
            this.tokens -= count;
            return;
        }
        // Not enough tokens - calculate wait time
        const tokensNeeded = count - this.tokens;
        const waitTimeMs = (tokensNeeded / this.refillRate) * 1000;
        // Wait for tokens to refill
        await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
        // Refill and consume
        this.refill();
        this.tokens -= count;
    }
    tryConsume(count = 1) {
        this.refill();
        if (this.tokens >= count) {
            this.tokens -= count;
            return true;
        }
        return false;
    }
    get availableTokens() {
        this.refill();
        return this.tokens;
    }
}
exports.TokenBucket = TokenBucket;
//# sourceMappingURL=rate-limiter.js.map