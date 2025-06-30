// ──────────────────────────────────────────────────────────────────────────────
// api/utils.ts
//
// Shared utility functions for the StaticAnalyzer API:
//   - resolveTsConfig   – locates the project's tsconfig.json
//
// Used throughout the route handlers to validate and initialize ts-morph projects.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync } from "fs";
import { join } from "path";

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