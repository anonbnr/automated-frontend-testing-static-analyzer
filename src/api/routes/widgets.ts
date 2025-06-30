// ──────────────────────────────────────────────────────────────────────────────
// api/routes/widgets.ts
//
// Traverses an Angular component’s template to extract its widget hierarchy.
//   - POST /widgets
//     - Validates `projectRoot` and `selector` params
//     - Ensures `tsconfig.json` exists
//     - Builds the full ComponentRegistry
//     - Finds the component by selector
//     - Returns its nested `WidgetInfo[]` tree (sans AST nodes)
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { WidgetInfo } from '../../models/widget-info.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * Recursively strips non‐serializable fields (like AST nodes) from WidgetInfo.
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
 * Extracts the widget tree for a given component.
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
 *     widgets: WidgetInfo[]
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing `projectRoot` or `selector`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   404 Not Found   – Component selector not registered
 *   500 Internal Server Error – Widget extraction failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };

    logger.debug('[POST /widgets] projectRoot=%o, selector=%o', projectRoot, selector);
    if (!projectRoot || !selector) {
        logger.warn('[POST /widgets] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /widgets] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    
    try {
        logger.info("[POST /widgets] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        
        // Build registry
        logger.info('[POST /widgets] Building component registry…');
        const registry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info('[POST /widgets] Registry has %d components', registry.components.length);

        // Find component
        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /widgets] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component "${selector}" not found` });
        }

        logger.info('[POST /widgets] Found component "%s", extracting widgets…', selector);

        // Sanitize widget tree
        const widgets = comp.widgets.map(sanitizeWidget);
        logger.info('[POST /widgets] Returning %d widgets for "%s"', widgets.length, selector);

        return res.json({ success: true, widgets });
    } catch (err: any) {
        logger.error('[POST /widgets] Error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to extract widgets' });
    }
});

export default router;