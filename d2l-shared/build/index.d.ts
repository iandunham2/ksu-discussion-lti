/**
 * d2l-shared
 * Shared D2L/Brightspace client, authentication, configuration, and logging.
 */
export { D2LApiClient, discoverVersions, TTLCache, TokenBucket, ApiError, RateLimitError, NetworkError, DEFAULT_CACHE_TTLS, } from "./api/index.js";
export type { ApiVersions, CacheTTLs, RateLimitConfig, D2LApiClientOptions, } from "./api/index.js";
export { TokenManager, SessionStore, } from "./auth/index.js";
export { loadConfig } from "./utils/config.js";
export { configStoreExists, loadConfigStore, saveConfigStore, getConfigStorePath, } from "./utils/config-store.js";
export type { ConfigStoreData, ConfigStoreData as ConfigStore, } from "./utils/config-store.js";
export { log, setLogLevel, enableStdoutGuard, getLogger } from "./utils/logger.js";
export type { Logger } from "./utils/logger.js";
export { AuthError, TokenExpiredError, BrowserAuthError, SessionStoreError, } from "./utils/errors.js";
export type { TokenData, EncryptedData, SessionFile, AppConfig, AuthResult, CourseFilterConfig, LogLevel, } from "./types/index.js";
//# sourceMappingURL=index.d.ts.map