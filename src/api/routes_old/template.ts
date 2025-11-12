// ──────────────────────────────────────────────────────────────────────────────
// api/routes/template.ts
//
// Express router: analyzes a single Angular component's template.
//
// Endpoint:
//   POST /template
//
// Request body:
//   {
//     projectRoot: string,   // absolute path to Angular workspace root
//     selector: string       // component selector (e.g. "app-login")
//   }
//
// Processing steps:
//   1) Validate input and resolve `tsconfig.json` from `projectRoot`
//   2) Create a ts-morph Project using the resolved tsconfig
//   3) Build the ComponentRegistry (discover components + templates)
//   4) Find the component matching `selector`
//   5) Return its ComponentInfo (widgets, nestedComponents, metadata)
//
// Success (200):
//   { success: true, component: ComponentInfo }
//
// Errors:
//   400 — missing params or tsconfig not found
//   404 — selector not found in registry
//   500 — template parsing or analysis failure
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
 * Analyzes the template of a single Angular component and returns its
 * `ComponentInfo`, which includes:
 *  - `selector`: component's HTML selector
 *  - `name`: class name of the component
 *  - `widgets`: parsed WidgetInfo[] hierarchy
 *  - `nestedComponents`: child component selectors
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace", "selector": "app-example" }
 * ```
 *
 * Response (200):
 * ```json
 * { "success": true, "component": { "selector": "...", "widgets": [...], ... } }
 * ```
 *
 * Error Responses:
 *  - 400: invalid or missing projectRoot/selector
 *  - 404: component not found
 *  - 500: unexpected template analysis failure
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };
    logger.debug('[POST /template] projectRoot=%o, selector=%o', projectRoot, selector);

    // Validate required parameters
    if (!projectRoot || !selector) {
        logger.warn('[POST /template] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    // Resolve the tsconfig.json path under projectRoot
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /template] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }


    try {
        // Initialize ts-morph project from the resolved tsconfig
        logger.info("[POST /template] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });

        // Build ComponentRegistry (discover all @Component templates)
        const builder = new ComponentRegistryBuilder(project);
        logger.info('[POST /template] Building component registry…');
        const registry = await builder.buildComponentsRegistry();
        logger.info(
            '[POST /template] Component registry built with %d entries',
            registry.size
        );

        // Locate the target component by its selector
        logger.info('[POST /template] Looking up selector="%s"', selector);
        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /template] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component with selector "${selector}" not found` });
        }

        // Return the full ComponentInfo (includes widgets and nestedComponents)
        logger.info(
            '[POST /template] Found component "%s" → returning ComponentInfo',
            selector
        );

        // Return the full ComponentInfo (selector, name, widgets, nestedComponents)
        return res.json({ success: true, component: comp });
    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error('[POST /template] Analysis error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to analyze template' });
    }
});

export default router;