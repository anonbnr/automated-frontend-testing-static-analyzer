// ──────────────────────────────────────────────────────────────────────────────
// api/routes/template.ts
//
// Handles analysis of a single component’s template.
//   - POST /template
//     - Validates `projectRoot` and `selector` params
//     - Ensures `tsconfig.json` exists
//     - Uses `ComponentRegistryBuilder` to build the registry
//     - Finds the `ComponentInfo` for the given selector
//     - Returns its `widgets` and `nestedComponents` metadata
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * POST /template
 *
 * Analyzes the template of a single Angular component.
 *
 * Request body:
 *   {
 *     projectRoot: string,
 *     selector: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     component: ComponentInfo
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing `projectRoot` or `selector`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   404 Not Found   – No component with the given selector
 *   500 Internal Server Error – Template analysis failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };
    logger.debug('[POST /template] projectRoot=%o, selector=%o', projectRoot, selector);
    if (!projectRoot || !selector) {
        logger.warn('[POST /template] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /template] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }


    try {
        // Initialize ts-morph project and registry builder
        logger.info("[POST /template] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });

        const builder = new ComponentRegistryBuilder(project);
        logger.info('[POST /template] Building component registry…');
        const registry = await builder.buildComponentsRegistry();
        logger.info(
            '[POST /template] Component registry built with %d entries',
            registry.size
        );

        // Find the requested component
        logger.info('[POST /template] Looking up selector="%s"', selector);
        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /template] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component with selector "${selector}" not found` });
        }

        logger.info(
            '[POST /template] Found component "%s" → returning ComponentInfo',
            selector
        );

        // Return the full ComponentInfo (selector, name, widgets, nestedComponents)
        return res.json({ success: true, component: comp });
    } catch (err: any) {
        logger.error('[POST /template] Analysis error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to analyze template' });
    }
});

export default router;