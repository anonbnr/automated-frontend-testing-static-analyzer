// ──────────────────────────────────────────────────────────────────────────────
// api/utils.ts
//
// Shared utility functions for the StaticAnalyzer API:
//   - resolveTsConfig   – locates the project's tsconfig.json
//
// Used throughout the route handlers to validate and initialize ts-morph projects.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync } from "fs";
import path, { join } from "path";
import { fileURLToPath } from "url";

/**
 * Resolve the path to `tsconfig.json` under the given project root.
 *
 * @param projectRoot - Root directory of the Angular project.
 * @returns The absolute path to `tsconfig.json` if it exists, otherwise `undefined`.
 */
export function resolveTsConfig(projectRoot: string): string | undefined {
    const tsConfigPath = join(projectRoot, 'tsconfig.json');
    return existsSync(tsConfigPath) ? tsConfigPath : undefined;
}

/**
 * Walk upward from a starting directory to find a given file (e.g., ".env").
 */
function findUpFile(startDir: string, name: string): string | null {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, name);
        if (existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Resolve a possibly-relative path against the repo "platform root" (where .env is).
 * If the env value is absolute, returns it as-is.
 * If not provided, uses the given fallback (relative to platform root).
 */
export function resolveFromPlatformRoot(relOrAbs: string | undefined, fallbackRel: string): string {
    const here = fileURLToPath(import.meta.url);
    const start = path.dirname(here);
    const envPath = findUpFile(start, '.env'); // your .env at repo root
    const platformRoot = envPath ? path.dirname(envPath) : process.cwd();

    const raw = (relOrAbs && relOrAbs.trim()) || fallbackRel;
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(platformRoot, raw);
}