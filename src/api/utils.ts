// ──────────────────────────────────────────────────────────────────────────────
// api/utils.ts
//
// Shared utility functions for the StaticAnalyzer API:
//   • resolveTsConfig          – locate the project's tsconfig.json
//   • findUpFile               – walk upwards to find a named file (e.g., ".env")
//   • resolveFromPlatformRoot  – resolve paths against the repo "platform root"
//
// Used across route handlers and env helpers to validate inputs and initialize
// ts-morph projects or derive absolute paths.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import path, { join, resolve } from "path";
import { fileURLToPath } from "url";
import { BACKEND_ROOT } from "./env.js";

/**
 * Resolve the absolute path to `tsconfig.json` under the given project root.
 *
 * @param projectRoot - Root directory of the Angular project.
 * @returns Absolute path to `tsconfig.json` if it exists; otherwise `undefined`.
 */
export function resolveTsConfig(projectRoot: string): string | undefined {
    const tsConfigPath = join(projectRoot, 'tsconfig.json');
    return existsSync(tsConfigPath) ? tsConfigPath : undefined;
}

/**
 * Walk upward from a starting directory until a file with the given name is found,
 * or the filesystem root is reached.
 *
 * @param startDir - Directory to start the search from.
 * @param name     - Filename to look for (e.g., ".env", "package.json").
 * @returns Absolute path to the found file, or null if none found.
 */
function findUpFile(startDir: string, name: string): string | null {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, name);
        if (existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null; // reached filesystem root
        dir = parent;
    }
}

/**
 * Resolve a possibly-relative path against the repository "platform root"
 * (heuristically detected as the directory containing the nearest ".env").
 *
 * • If `relOrAbs` is absolute: returns it as-is (normalized).
 * • If `relOrAbs` is relative or empty: resolves it against the platform root.
 * • If no ".env" is found: falls back to the current working directory.
 *
 * @param relOrAbs    - A relative or absolute path (may be undefined/empty).
 * @param fallbackRel - Fallback relative path to use when `relOrAbs` is unset.
 * @returns Absolute resolved path.
 */
export function resolveFromPlatformRoot(relOrAbs: string | undefined, fallbackRel: string): string {
    const here = fileURLToPath(import.meta.url);
    const start = path.dirname(here);
    const envPath = findUpFile(start, '.env'); // typically repo root
    const platformRoot = envPath ? path.dirname(envPath) : process.cwd();

    const raw = (relOrAbs && relOrAbs.trim()) || fallbackRel;
    return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(platformRoot, raw);
}

/** Generate a short, sortable request id: R-<base36 timestamp>-<rand> */
export function rid() {
    return `R-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Safe read of backend version from package.json (fallback "0.0.0"). */
export function readBackendVersion(): string {
    try {
        const pkgPath = resolve(BACKEND_ROOT, 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}