// ──────────────────────────────────────────────────────────────────────────────
// api/env.ts
//
// Centralized environment configuration and typed access helpers for the API.
//
// Responsibilities:
//   • Load .env deterministically before any module accesses process.env.
//   • Support monorepo structures by walking upward to locate the nearest ".env".
//   • Allow explicit override via ENV_FILE environment variable.
//   • Provide typed, validated, and post-processed configuration values
//     (numbers, booleans, strings) with sensible defaults.
//   • Expose `env` as the canonical runtime configuration for the backend.
// ──────────────────────────────────────────────────────────────────────────────

import { config } from 'dotenv';
import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Recursively searches upwards from a starting directory until
 * a ".env" file is found or the filesystem root is reached.
 *
 * @param startDir - Directory from which to begin the search.
 * @returns The path to the nearest .env file, or null if none found.
 */
function findNearestDotenv(startDir: string): string | null {
    let dir = path.resolve(startDir);
    while (true) {
        const candidate = path.join(dir, '.env');
        if (existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break; // Reached filesystem root.
        dir = parent;
    }
    return null;
}

/**
 * Resolves which `.env` file to load, following a deterministic priority:
 *   1. ENV_FILE — explicit override path (absolute or relative to CWD)
 *   2. Nearest `.env` from current working directory (CWD)
 *   3. Nearest `.env` relative to this module's directory (useful in dist/)
 *
 * @returns Path to the chosen .env file or null if none found.
 */
function resolveDotenvPath(): string | null {
    const explicit = process.env.ENV_FILE
        ? path.resolve(process.cwd(), process.env.ENV_FILE)
        : null;

    if (explicit && existsSync(explicit)) return explicit;

    const fromCwd = findNearestDotenv(process.cwd());
    if (fromCwd) return fromCwd;

    // At runtime, __dirname may be ".../dist/api" or ".../src/api"
    const fromHere = findNearestDotenv(path.resolve(__dirname, '..'));
    if (fromHere) return fromHere;

    return null;
}

/**
 * Immediately load and configure environment variables before any access.
 * This ensures consistent, deterministic environment state across the app.
 */
(() => {
    const dotenvPath = resolveDotenvPath();
    if (dotenvPath) {
        // By default, .env values do NOT override system variables.
        // To force override, set ENV_OVERRIDE=true (or 1/yes/on).
        const shouldOverride =
            ['1', 'true', 'yes', 'on'].includes(String(process.env.ENV_OVERRIDE || '').toLowerCase());
        config({ path: dotenvPath, override: shouldOverride });
        console.info(`[env] loaded .env from: ${dotenvPath}${shouldOverride ? ' (override=true)' : ''}`);
    }
    else console.warn('[env] no .env file found (using process environment only)');
})();

/** Absolute path to backend project root (assumes server runs from backend/). */
export const BACKEND_ROOT = process.cwd();

/**
 * Resolves a relative path against the backend root, falling back to a default.
 *
 * @param relOrAbs - User-specified relative or absolute path.
 * @param fallbackRel - Default relative path to use if input is missing.
 * @returns Absolute resolved path.
 */
export function resolveFromBackendRoot(relOrAbs: string | undefined, fallbackRel: string): string {
    const raw = (relOrAbs && relOrAbs.trim()) || fallbackRel;
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(BACKEND_ROOT, raw);
}

/** Utility: Parse numeric environment variable with default fallback. */
function envNum(name: string, def: number): number {
    const v = process.env[name];
    if (!v) return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

/** Utility: Parse string environment variable with trimming and default fallback. */
function envStr(name: string, def: string): string {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : def;
}

/**
 * Utility: Parse boolean environment variable with default fallback.
 * Accepts flexible truthy/falsy values (1/0, yes/no, true/false, on/off).
 */
function envBool(name: string, def: boolean): boolean {
    const v = process.env[name];
    if (v == null) return def;
    const s = v.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(s) ? true :
        ['0', 'false', 'no', 'n', 'off'].includes(s) ? false : def;
}

/**
 * Derives the frontend base URL for screenshots and integration features.
 * Falls back to localhost with the configured FRONTEND_PORT if not explicitly set.
 */
function deriveFrontendBaseUrl(): string {
    const explicit = process.env.BACKEND_SCREENSHOTS_BASE_URL;
    if (explicit && explicit.trim()) return explicit.trim();
    const port = envStr('FRONTEND_PORT', '4200');
    return `http://localhost:${port}`;
}

/**
 * Canonical, typed, and post-processed environment configuration object.
 * All environment values should be accessed via this object.
 */
export const env = {
    // ── Server configuration ───────────────────────────────────────────────
    PORT: envNum('BACKEND_PORT', envNum('PORT', 3000)),

    // ── Screenshot storage and serving ─────────────────────────────────────
    SCREENSHOTS_STORAGE_ROOT: resolveFromBackendRoot(
        process.env.BACKEND_SCREENSHOTS_STORAGE_DIR,
        'data/screenshots'
    ),
    SCREENSHOTS_BASE_URL: deriveFrontendBaseUrl(),

    // ── LLM-related configuration (optional feature) ───────────────────────
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

    // ── General application configuration ───────────────────────────────────
    app: {
        cache: {
            TTL_SEC: envNum('TTL_SEC', 600)
        }
    },

    db: {
        config: {
            HOST: envStr('DBHOST', 'localhost'),
            PORT: envNum('DBPORT', 3306),
            USER: envStr('DBUSER', 'user'),
            PASSWORD: envStr('DBPASS', '0000'),
            DB: envStr('DBNAME', 'testing'),
        }
    },

    // ── Express body-parser JSON limit ─────────────────────────────────────
    API_JSON_LIMIT: envStr('API_JSON_LIMIT', '10mb'),
};

/**
 * Returns a human-friendly diagnostic message if the LLM subsystem
 * is disabled or misconfigured. Used to guide developers in setup.
 *
 * @returns String message describing misconfiguration, or null if OK.
 */
export function getLlmMisconfigHint(): string | null {
    if (!env.llm.enabled) return 'LLM is disabled (set LLM_ENABLED=true).';
    if (env.llm.provider === 'openai' && !env.llm.openai.apiKey) {
        return 'Missing LLM_API_KEY for provider "openai".';
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Optional: self-check — logs key configuration values at startup.
// Uncomment during development for quick sanity checks.
// ──────────────────────────────────────────────────────────────────────────────
console.info('[env] PORT=%d', env.PORT);
console.info('[env] API_JSON_LIMIT=%s', env.API_JSON_LIMIT);
console.info('[env] SCREENSHOTS_STORAGE_ROOT=%s', env.SCREENSHOTS_STORAGE_ROOT);
console.info('[env] SCREENSHOTS_BASE_URL=%s', env.SCREENSHOTS_BASE_URL);
console.info('[env] LLM enabled=%s provider=%s', String(env.llm.enabled), env.llm.provider);