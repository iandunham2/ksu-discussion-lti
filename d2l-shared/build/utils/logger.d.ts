/**
 * Shared D2L/Brightspace logging utilities.
 */
import type { LogLevel } from "../types/index.js";
export declare function setLogLevel(level: LogLevel): void;
export declare function log(level: LogLevel, message: string, ...args: unknown[]): void;
export declare function enableStdoutGuard(): void;
/** Namespaced logger returned by {@link getLogger}. */
export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
/**
 * Create a namespaced logger that writes through the shared logging utility.
 * Info messages are written to stdout; debug/warn/error go to stderr.
 */
export declare function getLogger(namespace: string): Logger;
//# sourceMappingURL=logger.d.ts.map