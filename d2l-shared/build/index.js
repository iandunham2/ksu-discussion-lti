"use strict";
/**
 * d2l-shared
 * Shared D2L/Brightspace client, authentication, configuration, and logging.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStoreError = exports.BrowserAuthError = exports.TokenExpiredError = exports.AuthError = exports.getLogger = exports.enableStdoutGuard = exports.setLogLevel = exports.log = exports.getConfigStorePath = exports.saveConfigStore = exports.loadConfigStore = exports.configStoreExists = exports.loadConfig = exports.SessionStore = exports.TokenManager = exports.DEFAULT_CACHE_TTLS = exports.NetworkError = exports.RateLimitError = exports.ApiError = exports.TokenBucket = exports.TTLCache = exports.discoverVersions = exports.D2LApiClient = void 0;
// D2L API client and infrastructure
var index_js_1 = require("./api/index.js");
Object.defineProperty(exports, "D2LApiClient", { enumerable: true, get: function () { return index_js_1.D2LApiClient; } });
Object.defineProperty(exports, "discoverVersions", { enumerable: true, get: function () { return index_js_1.discoverVersions; } });
Object.defineProperty(exports, "TTLCache", { enumerable: true, get: function () { return index_js_1.TTLCache; } });
Object.defineProperty(exports, "TokenBucket", { enumerable: true, get: function () { return index_js_1.TokenBucket; } });
Object.defineProperty(exports, "ApiError", { enumerable: true, get: function () { return index_js_1.ApiError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return index_js_1.RateLimitError; } });
Object.defineProperty(exports, "NetworkError", { enumerable: true, get: function () { return index_js_1.NetworkError; } });
Object.defineProperty(exports, "DEFAULT_CACHE_TTLS", { enumerable: true, get: function () { return index_js_1.DEFAULT_CACHE_TTLS; } });
// Brightspace / D2L authentication
var index_js_2 = require("./auth/index.js");
Object.defineProperty(exports, "TokenManager", { enumerable: true, get: function () { return index_js_2.TokenManager; } });
Object.defineProperty(exports, "SessionStore", { enumerable: true, get: function () { return index_js_2.SessionStore; } });
// Configuration, logging, and shared errors
var config_js_1 = require("./utils/config.js");
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return config_js_1.loadConfig; } });
var config_store_js_1 = require("./utils/config-store.js");
Object.defineProperty(exports, "configStoreExists", { enumerable: true, get: function () { return config_store_js_1.configStoreExists; } });
Object.defineProperty(exports, "loadConfigStore", { enumerable: true, get: function () { return config_store_js_1.loadConfigStore; } });
Object.defineProperty(exports, "saveConfigStore", { enumerable: true, get: function () { return config_store_js_1.saveConfigStore; } });
Object.defineProperty(exports, "getConfigStorePath", { enumerable: true, get: function () { return config_store_js_1.getConfigStorePath; } });
var logger_js_1 = require("./utils/logger.js");
Object.defineProperty(exports, "log", { enumerable: true, get: function () { return logger_js_1.log; } });
Object.defineProperty(exports, "setLogLevel", { enumerable: true, get: function () { return logger_js_1.setLogLevel; } });
Object.defineProperty(exports, "enableStdoutGuard", { enumerable: true, get: function () { return logger_js_1.enableStdoutGuard; } });
Object.defineProperty(exports, "getLogger", { enumerable: true, get: function () { return logger_js_1.getLogger; } });
var errors_js_1 = require("./utils/errors.js");
Object.defineProperty(exports, "AuthError", { enumerable: true, get: function () { return errors_js_1.AuthError; } });
Object.defineProperty(exports, "TokenExpiredError", { enumerable: true, get: function () { return errors_js_1.TokenExpiredError; } });
Object.defineProperty(exports, "BrowserAuthError", { enumerable: true, get: function () { return errors_js_1.BrowserAuthError; } });
Object.defineProperty(exports, "SessionStoreError", { enumerable: true, get: function () { return errors_js_1.SessionStoreError; } });
//# sourceMappingURL=index.js.map