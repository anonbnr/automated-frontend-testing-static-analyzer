// ──────────────────────────────────────────────────────────────────────────────
// api/routes/components.ts
//
// Express router: discovers all Angular `@Component` classes in a workspace
// and returns the full ComponentRegistry (flattened as an array of ComponentInfo).
//
// Endpoint:
//   POST /components
//
// Request body:
//   { projectRoot: string }   // absolute path to the Angular workspace root
//
// High-level flow:
//   1) Validate `projectRoot` and resolve its `tsconfig.json`
//   2) Create a ts-morph Project from the resolved tsconfig
//   3) Build the ComponentRegistry by analyzing templates
//   4) Return `registry.components`
//
// Success (200):
//   { success: true, components: ComponentInfo[] }
//
// Errors:
//   400 — missing/invalid `projectRoot`, or `tsconfig.json` not found
//   500 — unexpected failure while building the registry
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * POST /components
 *
 * Discovers every `@Component` in the target Angular workspace and returns
 * the complete ComponentRegistry as an array of `ComponentInfo`.
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace" }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "components": [ /* ComponentInfo[] *\/ ]
 * }
 * ```
 *
 * Error Responses:
 *  - 400: `projectRoot` missing/invalid, or `tsconfig.json` not found
 *  - 500: registry construction failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug("[POST /components] projectRoot='%s'", projectRoot);

    // Basic param validation
    if (!projectRoot) {
        logger.warn("[POST /components] Missing projectRoot");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    // Resolve tsconfig.json under projectRoot
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn("[POST /components] tsconfig.json not found under %s", projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph Project from the resolved tsconfig
        logger.info("[POST /components] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });

        // Build the ComponentRegistry (parses templates → widgets & nested selectors)
        logger.info("[POST /components] Building component registry…");
        const builder = new ComponentRegistryBuilder(project);
        const registry: ComponentRegistry = await builder.buildComponentsRegistry();
        logger.info(
            "[POST /components] Registry built with %d components",
            registry.components.length
        );

        // Success: return the array of ComponentInfo
        return res.json({ success: true, components: registry.components });
    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error("[POST /components] Fatal error: %o", err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to build component registry' });
    }
});

export default router;