/**
 * Shared D2L/Brightspace logging utilities.
 */

import type { LogLevel } from "../types/index.js";

let currentLevel: LogLevel = "INFO";

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Redact sensitive patterns from log output.
 * Tokens, passwords, and secrets are replaced with first 8 chars + "...REDACTED".
 */
function redact(value: string): string {
  // Redact Bearer tokens
  value = value.replace(
    /Bearer\s+([A-Za-z0-9._~+/=-]{8})[A-Za-z0-9._~+/=-]*/g,
    "Bearer $1...REDACTED"
  );
  // Redact cookie: prefixed tokens
  value = value.replace(
    /cookie:([^\s]{8})[^\s]*/g,
    "cookie:$1...REDACTED"
  );
  // Redact anything that looks like a long token (40+ chars of base64-like)
  value = value.replace(
    /([A-Za-z0-9._~+/=-]{40,})/g,
    (match) => match.substring(0, 8) + "...REDACTED"
  );
  return value;
}

export function log(
  level: LogLevel,
  message: string,
  ...args: unknown[]
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
  const timestamp = new Date().toISOString();
  const safeMessage = redact(message);
  console.error(`[${timestamp}] [${level}] ${safeMessage}`, ...args);
}

// Override console.log in production to prevent accidental stdout writes
export function enableStdoutGuard(): void {
  console.log = (...args: unknown[]) => {
    console.error(
      "[WARN] console.log intercepted (would corrupt stdio):",
      ...args,
    );
  };
}

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
export function getLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;
  return {
    debug: (message, ...args) =>
      log("DEBUG", `${prefix} ${message}`, ...args),
    info: (message, ...args) => {
      if (LEVEL_ORDER.INFO < LEVEL_ORDER[currentLevel]) return;
      const timestamp = new Date().toISOString();
      const safeMessage = redact(message);
      console.log(`[${timestamp}] [INFO] ${prefix} ${safeMessage}`, ...args);
    },
    warn: (message, ...args) =>
      log("WARN", `${prefix} ${message}`, ...args),
    error: (message, ...args) =>
      log("ERROR", `${prefix} ${message}`, ...args),
  };
}
