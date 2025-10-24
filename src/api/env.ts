// api/env.ts
// Centralized environment loading & helpers used across the API.
// - Loads .env deterministically before other modules read process.env
// - Supports monorepos: finds the nearest ".env" by walking up from CWD and from this file's dir
// - Allows explicit override via ENV_FILE
// - Provides typed, post-processed values with sensible defaults

import { config } from 'dotenv';
import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Walk upwards from a start directory until a ".env" file is found or filesystem root is reached. */
function findNearestDotenv(startDir: string): string | null {
    let dir = path.resolve(startDir);
    while (true) {
        const candidate = path.join(dir, '.env');
        if (existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break; // reached root
        dir = parent;
    }
    return null;
}

/** Decide which .env to load:
 * 1) ENV_FILE (absolute or relative to CWD)
 * 2) nearest .env from CWD
 * 3) nearest .env from this file's directory (works from dist/)
 */
function resolveDotenvPath(): string | null {
    const explicit = process.env.ENV_FILE
        ? path.resolve(process.cwd(), process.env.ENV_FILE)
        : null;

    if (explicit && existsSync(explicit)) return explicit;

    const fromCwd = findNearestDotenv(process.cwd());
    if (fromCwd) return fromCwd;

    // __dirname at runtime may be ".../dist/api" (compiled) or ".../src/api" (ts-node)
    const fromHere = findNearestDotenv(path.resolve(__dirname, '..'));
    if (fromHere) return fromHere;

    return null;
}

// Load .env *before* reading any env vars.
(() => {
    const dotenvPath = resolveDotenvPath();
    if (dotenvPath) {
        // override:false => OS/env vars win over .env (safest default).
        // set ENV_OVERRIDE=1 to force .env values to override process.env during local dev.
        const shouldOverride =
            ['1', 'true', 'yes', 'on'].includes(String(process.env.ENV_OVERRIDE || '').toLowerCase());
        config({ path: dotenvPath, override: shouldOverride });

        // eslint-disable-next-line no-console
        console.info(`[env] loaded .env from: ${dotenvPath}${shouldOverride ? ' (override=true)' : ''}`);
    } else {
        // eslint-disable-next-line no-console
        console.warn('[env] no .env file found (using process environment only)');
    }
})();

/** Backend project root. Assumes you start the server from the backend/ dir. */
export const BACKEND_ROOT = process.cwd();

/** Resolve a path relative to the backend root (unless absolute). */
export function resolveFromBackendRoot(relOrAbs: string | undefined, fallbackRel: string): string {
    const raw = (relOrAbs && relOrAbs.trim()) || fallbackRel;
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(BACKEND_ROOT, raw);
}

/** Parse number env var with default. */
function envNum(name: string, def: number): number {
    const v = process.env[name];
    if (!v) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

/** Direct string with default. */
function envStr(name: string, def: string): string {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : def;
}

/** Parse boolean env var with default. */
function envBool(name: string, def: boolean): boolean {
    const v = process.env[name];
    if (v == null) return def;
    const s = v.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(s) ? true :
        ['0', 'false', 'no', 'n', 'off'].includes(s) ? false : def;
}

/** Derived frontend base URL. */
function deriveFrontendBaseUrl(): string {
    const explicit = process.env.BACKEND_SCREENSHOTS_BASE_URL;
    if (explicit && explicit.trim()) return explicit.trim();
    const port = envStr('FRONTEND_PORT', '4200');
    return `http://localhost:${port}`;
}

export const env = {
    // Server port (prefer BACKEND_PORT, then PORT)
    PORT: envNum('BACKEND_PORT', envNum('PORT', 3000)),

    // Screenshots config
    SCREENSHOTS_STORAGE_ROOT: resolveFromBackendRoot(
        process.env.BACKEND_SCREENSHOTS_STORAGE_DIR,
        'data/screenshots'
    ),
    SCREENSHOTS_BASE_URL: deriveFrontendBaseUrl(),

    // LLM config (feature-gated)
    llm: {
        enabled: envBool('LLM_ENABLED', false),
        provider: envStr('LLM_PROVIDER', 'openai') as 'openai',
        openai: {
            apiKey: envStr('LLM_API_KEY', ''),
            model: envStr('LLM_MODEL', 'gpt-4o-mini'),
            timeoutMs: envNum('LLM_TIMEOUT_MS', 360000),
            maxTokens: envNum('LLM_MAX_TOKENS', 12000),
            rateLimitPerMin: envNum('LLM_RATE_LIMIT_PER_MIN', 30),
            baseUrl: process.env.LLM_BASE_URL && process.env.LLM_BASE_URL.trim()
                ? process.env.LLM_BASE_URL.trim()
                : undefined,
        },
        journeysCacheTtlSec: envNum('LLM_JOURNEYS_CACHE_TTL_SEC', 600),
    },

    app: {
        cache: {
            TTL_SEC: envNum('TTL_SEC', 600)
        }
    },

    // Max JSON request size accepted by body-parser. Express accepts values like '100kb', '1mb'.
    API_JSON_LIMIT: envStr('API_JSON_LIMIT', '10mb'),
};

/** Human-friendly hint string if LLM is disabled or misconfigured. */
export function getLlmMisconfigHint(): string | null {
    if (!env.llm.enabled) return 'LLM is disabled (set LLM_ENABLED=true).';
    if (env.llm.provider === 'openai' && !env.llm.openai.apiKey) {
        return 'Missing LLM_API_KEY for provider "openai".';
    }
    return null;
}

// Optional: tiny self-check (uncomment during debugging)
console.info('[env] PORT=%d', env.PORT);
console.info('[env] API_JSON_LIMIT=%s', env.API_JSON_LIMIT);
console.info('[env] SCREENSHOTS_STORAGE_ROOT=%s', env.SCREENSHOTS_STORAGE_ROOT);
console.info('[env] SCREENSHOTS_BASE_URL=%s', env.SCREENSHOTS_BASE_URL);
console.info('[env] LLM enabled=%s provider=%s', String(env.llm.enabled), env.llm.provider);