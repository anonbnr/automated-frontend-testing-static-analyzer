// ──────────────────────────────────────────────────────────────────────────────
// api/routes/components.ts
//
// Discovers every @Component in an Angular workspace and returns the full registry.
//   - POST /components
//     - Validates `projectRoot` parameter
//     - Ensures `tsconfig.json` exists
//     - Uses `ComponentRegistryBuilder` to analyze all templates
//     - Returns array of `ComponentInfo`
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { resolveTsConfig } from '../utils.js';
import logger from '../../logging/logger.js';

const router = Router();

/**
 * POST /components
 *
 * Discovers every @Component in the workspace and returns the full registry.
 *
 * Request body:
 *   {
 *     projectRoot: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     components: ComponentInfo[]
 *   }
 *
 * Error Responses:
 *   400 Bad Request - Missing or invalid `projectRoot`
 *   400 Bad Request - `tsconfig.json` not found under `projectRoot`
 *   500 Internal Server Error - Registry construction failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug("[POST /components] projectRoot='%s'", projectRoot);
    if (!projectRoot) {
        logger.warn("[POST /components] Missing projectRoot");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn("[POST /components] tsconfig.json not found under %s", projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph project and registry builder
        logger.info("[POST /components] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });

        // Build the component registry (scans templates, extracts widgets & nested selectors)
        logger.info("[POST /components] Building component registry…");
        const builder = new ComponentRegistryBuilder(project);
        const registry: ComponentRegistry = await builder.buildComponentsRegistry();
        logger.info(
            "[POST /components] Registry built with %d components",
            registry.components.length
        );

        // Return the list of ComponentInfo
        return res.json({ success: true, components: registry.components });
    } catch (err: any) {
        logger.error("[POST /components] Fatal error: %o", err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to build component registry' });
    }
});

export default router;