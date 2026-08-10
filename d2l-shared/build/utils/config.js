"use strict";
/**
 * Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const config_store_js_1 = require("./config-store.js");
function loadConfig() {
    const store = (0, config_store_js_1.configStoreExists)() ? (0, config_store_js_1.loadConfigStore)() : null;
    if (store) {
        console.error("[config] Loaded base config from ~/.brightspace-mcp/config.json");
    }
    else {
        console.error("[config] No config.json found, using environment variables");
    }
    // Resolve sessionDir: env > store > default
    const sessionDir = process.env.D2L_SESSION_DIR
        ? expandTilde(process.env.D2L_SESSION_DIR)
        : store?.sessionDir
            ? expandTilde(store.sessionDir)
            : path.join(os.homedir(), ".d2l-session");
    // Resolve headless: env > store > default (false)
    let headless = store?.headless ?? false;
    if (process.env.D2L_HEADLESS !== undefined) {
        headless = process.env.D2L_HEADLESS === "true";
    }
    // Resolve tokenTtl: env > store > default (3600)
    const tokenTtl = process.env.D2L_TOKEN_TTL
        ? parseInt(process.env.D2L_TOKEN_TTL, 10)
        : store?.tokenTtl ?? 3600;
    // Resolve includeCourseIds: env > store > undefined
    const includeCourseIds = process.env.D2L_INCLUDE_COURSES
        ? process.env.D2L_INCLUDE_COURSES.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        : store?.includeCourses;
    // Resolve excludeCourseIds: env > store > undefined
    const excludeCourseIds = process.env.D2L_EXCLUDE_COURSES
        ? process.env.D2L_EXCLUDE_COURSES.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        : store?.excludeCourses;
    // Resolve activeOnly: env > store > default (true)
    let activeOnly = store?.activeOnly ?? true;
    if (process.env.D2L_ACTIVE_ONLY !== undefined) {
        activeOnly = process.env.D2L_ACTIVE_ONLY !== 'false';
    }
    // Normalize baseUrl: strip paths like /d2l/login — we only need the origin
    const rawBaseUrl = process.env.D2L_BASE_URL || store?.baseUrl || "https://purdue.brightspace.com";
    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    return {
        baseUrl,
        sessionDir,
        tokenTtl,
        headless,
        username: process.env.D2L_USERNAME || store?.username,
        password: process.env.D2L_PASSWORD || store?.password,
        courseFilter: {
            includeCourseIds,
            excludeCourseIds,
            activeOnly,
        },
    };
}
function normalizeBaseUrl(url) {
    // Add https:// if no scheme present
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = `https://${normalized}`;
    }
    try {
        const parsed = new URL(normalized);
        // Return just the origin (scheme + host + port)
        return parsed.origin;
    }
    catch {
        // If URL parsing fails, strip trailing slashes and common paths
        return normalized.replace(/\/d2l\/.*$/, "").replace(/\/+$/, "");
    }
}
function expandTilde(filePath) {
    if (filePath.startsWith("~")) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}
//# sourceMappingURL=config.js.map