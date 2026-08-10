# d2l-shared

Shared D2L/Brightspace building blocks used across the monorepo.

## What it provides

- **D2L API client** (`src/api/client.ts`) — `D2LApiClient` with caching, rate limiting, automatic 401 retry, and API version discovery.
- **Config store** (`src/utils/config-store.ts`) — persistent JSON config with schema validation.
- **Logger** (`src/utils/logger.ts`) — namespaced logging with automatic secret redaction.
- **Errors** (`src/utils/errors.ts`) — shared error classes (`ApiError`, `BrowserAuthError`, etc.).
- **Token manager** (`src/auth/token-manager.ts`) — encrypted token storage and refresh.
- **Session store** (`src/auth/session-store.ts`) — AES-256-GCM encrypted session file handling.

## What it does *not* provide

Browser-authentication logic (Playwright) lives in `packages/d2l-auth` so that consumers that only need the API client or logger are not forced to install Playwright.

## Usage

```ts
import { D2LApiClient, getLogger, loadConfig } from "d2l-shared";

const log = getLogger("my-tool");
const config = await loadConfig();
const client = new D2LApiClient(config);
```

## Version

**0.2.1**
