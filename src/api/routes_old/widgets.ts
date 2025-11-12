// ──────────────────────────────────────────────────────────────────────────────
// api/routes/widgets.ts
//
// Express router: traverses an Angular component's template to extract its
// widget hierarchy and returns a serializable tree (no AST nodes).
//
// Endpoint:
//   POST /widgets
//
// Request body:
//   {
//     projectRoot: string,   // absolute path to the Angular workspace root
//     selector: string       // component selector (e.g., "app-dashboard")
//   }
//
// Processing steps:
//   1) Validate inputs and resolve `tsconfig.json` from `projectRoot`
//   2) Create a ts-morph Project using the resolved tsconfig
//   3) Build the ComponentRegistry (parsing templates → WidgetInfo trees)
//   4) Locate the component by `selector`
//   5) Sanitize the widget tree (remove non-serializable fields) and return
//
// Success (200):
//   { success: true, widgets: WidgetInfo[] }
//
// Errors:
//   400 — missing `projectRoot`/`selector`, or `tsconfig.json` not found
//   404 — component with the given selector not found
//   500 — unexpected error during registry build or extraction
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { WidgetInfo } from '../../models/widget-info.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * Recursively strips non-serializable fields (e.g., ts-morph AST nodes) from a WidgetInfo node.
 *
 * Keeps:
 *   - `id`, `type`, `attributes`, `events`
 *   - `validationRules`, `triggersFormSubmission`
 *   - `children` (recursively sanitized)
 *
 * Drops:
 *   - any `originalNode` / AST references
 *
 * @param w WidgetInfo node to sanitize.
 * @returns A deep-copied, JSON-safe widget node (same shape minus AST fields).
 */
function sanitizeWidget(w: WidgetInfo): Omit<WidgetInfo, 'originalNode'> {
    const { id, type, attributes, events, validationRules, triggersFormSubmission, children } = w;
    return {
        id,
        type,
        attributes,
        events,
        validationRules,
        triggersFormSubmission,
        children: (children || []).map(sanitizeWidget)
    };
}

/**
 * POST /widgets
 *
 * Extracts the widget tree for a given component `selector` in the Angular project
 * rooted at `projectRoot`. Returns a sanitized WidgetInfo[] suitable for JSON transport.
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace", "selector": "app-example" }
 * ```
 *
 * Response (200):
 * ```json
 * { "success": true, "widgets": [ { "id": "...", "type": "...", "children": [ ... ] }, ... ] }
 * ```
 *
 * Error Responses:
 *  - 400: `projectRoot` or `selector` missing; or `tsconfig.json` not found
 *  - 404: component not present in the registry
 *  - 500: failure during registry build or widget extraction
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };

    logger.debug('[POST /widgets] projectRoot=%o, selector=%o', projectRoot, selector);

    // Basic required parameters
    if (!projectRoot || !selector) {
        logger.warn('[POST /widgets] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    // Resolve a tsconfig.json path under the supplied project root
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /widgets] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    
    try {
        // Initialize a ts-morph project from the resolved tsconfig
        logger.info("[POST /widgets] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        
        // Build registry (discovers @Component classes and analyzes templates → widgets)
        logger.info('[POST /widgets] Building component registry…');
        const registry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info('[POST /widgets] Registry has %d components', registry.components.length);

        // Find the target component by selector
        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /widgets] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component "${selector}" not found` });
        }

        logger.info('[POST /widgets] Found component "%s", extracting widgets…', selector);

        // Sanitize each root-level widget (remove AST fields etc.)
        const widgets = comp.widgets.map(sanitizeWidget);

        logger.info('[POST /widgets] Returning %d widgets for "%s"', widgets.length, selector);
        
        // Success response
        return res.json({ success: true, widgets });
    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error('[POST /widgets] Error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to extract widgets' });
    }
});

export default router;