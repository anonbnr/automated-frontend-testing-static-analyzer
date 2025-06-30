// ──────────────────────────────────────────────────────────────────────────────
// api/routes/widget-id.ts
//
// Generates and returns the unique widget IDs for a given component.
//   - POST /widget-id
//     - Validates `projectRoot` and `selector` params
//     - Ensures `tsconfig.json` exists
//     - Builds the ComponentRegistry
//     - Finds the component by selector
//     - Flattens its widget tree and returns just the `id` strings
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
 */
function collectIds(widgets: any[]): string[] {
    return widgets.reduce<string[]>((acc, w) => {
        acc.push(w.id);
        if (w.children?.length) acc.push(...collectIds(w.children));
        return acc;
    }, []);
}

/**
 * POST /widget-id
 *
 * Returns all widget IDs for a given component.
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
 *     widgetIDs: string[]
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing `projectRoot` or `selector`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   404 Not Found   – Component selector not registered
 *   500 Internal Server Error – ID generation failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot, selector } = req.body as {
        projectRoot?: string;
        selector?: string;
    };

    logger.debug('[POST /widget-id] projectRoot=%o, selector=%o', projectRoot, selector);
    if (!projectRoot || !selector) {
        logger.warn('[POST /widget-id] Bad Request – missing projectRoot or selector');
        return res
            .status(400)
            .json({ success: false, error: 'projectRoot and selector are required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn('[POST /widget-id] Bad Request – tsconfig.json not found under %s', projectRoot);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    
    try {
        logger.info("[POST /widget-id] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        
        logger.info('[POST /widget-id] Building component registry…');
        const registry: ComponentRegistry =
            await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info('[POST /widget-id] Registry has %d components', registry.components.length);

        const comp = registry.getBySelector(selector);
        if (!comp) {
            logger.warn('[POST /widget-id] Component "%s" not found', selector);
            return res
                .status(404)
                .json({ success: false, error: `Component "${selector}" not found` });
        }

        logger.info('[POST /widget-id] Found component "%s"', selector);

        // Flatten widget tree and collect IDs
        const widgetIDs = collectIds(comp.widgets);
        logger.info('[POST /widget-id] Returning %d widget IDs for "%s"', widgetIDs.length, selector);

        return res.json({ success: true, widgetIDs });
    } catch (err: any) {
        logger.error('[POST /widget-id] Error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to generate widget IDs' });
    }
});

export default router;