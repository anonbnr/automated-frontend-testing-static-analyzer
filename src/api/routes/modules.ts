// ──────────────────────────────────────────────────────────────────────────────
// api/routes/modules.ts
//
// Handles discovery of all NgModules in an Angular workspace.
//   - POST /modules
//     - Validates `projectRoot` param
//     - Ensures `tsconfig.json` exists
//     - Uses `ModuleRegistryBuilder` to find every `@NgModule`
//     - Returns array of `ModuleInfo`
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ModuleRegistryBuilder } from '../../builders/module-registry-builder.js';
import logger from '../../logging/logger.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * POST /modules
 *
 * Discovers every @NgModule in the workspace and returns the full registry.
 *
 * Request body:
 *   {
 *     projectRoot: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     modules: ModuleInfo[]
 *   }
 *
 * Error Responses:
 *   400 Bad Request - Missing or invalid `projectRoot`
 *   400 Bad Request - `tsconfig.json` not found under `projectRoot`
 *   500 Internal Server Error - Discovery process failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug("[POST /modules] projectRoot: '%s'", projectRoot);

    if (!projectRoot) {
        logger.warn("[POST /modules] Missing `projectRoot`");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn("[POST /modules] tsconfig.json not found under %s", projectRoot);
        return res.status(400).json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph project and builder
        logger.info("[POST /modules] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        const builder = new ModuleRegistryBuilder(project);

        // Phase 1: Discover modules
        logger.info("[POST /modules] Discovering modules...");
        await builder.discoverModules();
        const modules = builder.registry.modules;
        logger.info("[POST /modules] Discovered %d modules", modules.length);

        // Return the list of ModuleInfo
        return res.json({ success: true, modules });
    } catch (err: any) {
        logger.error("[POST /modules] Fatal error: %o", err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to discover modules' });
    }
});

export default router;