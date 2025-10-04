// src/api/env.ts
// Centralized environment loading & helpers used across the API.
// - Loads .env (once) before other modules read process.env
// - Provides typed, post-processed values (booleans, numbers, defaults)
// - Resolves relative paths *from the backend project root*

import 'dotenv/config';
import path from 'node:path';

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
};

// Helpful one-time log summary
console.info('[env] PORT=%d', env.PORT);
console.info('[env] SCREENSHOTS_STORAGE_ROOT=%s', env.SCREENSHOTS_STORAGE_ROOT);
console.info('[env] SCREENSHOTS_BASE_URL=%s', env.SCREENSHOTS_BASE_URL);