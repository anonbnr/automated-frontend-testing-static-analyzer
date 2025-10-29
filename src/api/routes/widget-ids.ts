// ──────────────────────────────────────────────────────────────────────────────
// api/routes/widget-ids.ts
//
// Express router: generates and returns the unique widget IDs for a target
// Angular component (by selector).
//
// Endpoint:
//   POST /widget-ids
//
// Request body:
//   {
//     projectRoot: string,   // absolute path to the Angular workspace root
//     selector: string       // component selector (e.g., "app-login")
//   }
//
// Processing steps:
//   1) Validate inputs and resolve `tsconfig.json` under `projectRoot`
//   2) Create a ts-morph Project from the resolved tsconfig
//   3) Build the ComponentRegistry (parsing templates → widgets)
//   4) Find the component by `selector`
//   5) Flatten its widget tree and return only the `id` strings
//
// Success (200):
//   { success: true, widgetIDs: string[] }
//
// Errors:
//   400 — missing `projectRoot`/`selector`, or `tsconfig.json` not found
//   404 — component not found in registry
//   500 — unexpected error while building registry / extracting IDs
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * Recursively flattens a widget tree into an array of IDs.
 * Expects each widget-like node to have:
 *   - `id: string`
 *   - optional `children?: any[]`
 *
 * @param widgets An array of widget nodes (root-level or nested).
 * @returns A flat array of widget ID strings.
 */
function collectIds(widgets: any[]): string[] {
    return widgets.reduce<string[]>((acc, w) => {
        acc.push(w.id);
        if (w.children?.length) acc.push(...collectIds(w.children));
        return acc;
    }, []);
}

/**
 * POST /widget-ids
 *
 * Returns all widget IDs for a given component selector.
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace", "selector": "app-example" }
 * ```
 *
 * Response (200):
 * ```json
 * { "success": true, "widgetIDs": ["comp__btn__save", "comp__input__email", "..."] }
 * ```
 *
 * Error Responses:
 *  - 400: `projectRoot` or `selector` missing; or `tsconfig.json` not found
 *  - 404: component with the specified `selector` not present in the registry
 *  - 500: failure during registry build or ID extraction
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };

    logger.debug('[POST /widget-ids] projectRoot=%o, selector=%o', projectRoot, selector);

    // Basic parameter validation
    if (!projectRoot || !selector) {
        logger.warn('[POST /widget-ids] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    // Resolve the tsconfig.json path from projectRoot
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /widget-ids] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    
    try {
        // Initialize ts-morph project using the resolved tsconfig
        logger.info("[POST /widget-ids] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        
        // Build the component registry (discovers @Component, parses templates → widgets)
        logger.info('[POST /widget-ids] Building component registry…');
        const registry: ComponentRegistry =
            await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info('[POST /widget-ids] Registry has %d components', registry.components.length);

        // Lookup the component by selector
        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /widget-ids] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component "${selector}" not found` });
        }

        logger.info('[POST /widget-ids] Found component "%s"', selector);

        // Flatten the widget tree and collect the `id` values only
        const widgetIDs = collectIds(comp.widgets);
        logger.info('[POST /widget-ids] Returning %d widget IDs for "%s"', widgetIDs.length, selector);

        // Success response
        return res.json({ success: true, widgetIDs });
    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error('[POST /widget-ids] Error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to generate widget IDs' });
    }
});

export default router;