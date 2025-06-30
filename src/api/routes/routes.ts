// ──────────────────────────────────────────────────────────────────────────────
// api/routes/routes.ts
//
// Analyzes Angular routing configuration and classifies component usage.
//   - POST /routes
//     - Validates `projectRoot` parameter
//     - Ensures `tsconfig.json` exists
//     - Discovers components via `ComponentRegistryBuilder`
//     - Runs `RouteAnalyzer` to build `ComponentRouteMap`
//     - Returns shallow-serialized routes, redirections, and component roles
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { RouteAnalyzer } from '../../analyzers/routes/route-analyzer.js';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { ComponentRouteMap } from '../../models/route-info.js';
import { resolveTsConfig } from '../utils.js';
import logger from '../../logging/logger.js';

const router = Router();

/**
 * POST /routes
 *
 * Runs route analysis to discover all routes and classify component roles.
 *
 * Request body:
 *   {
 *     projectRoot: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     routeMap: {
 *       routes: ComponentRoute[],
 *       redirections: RedirectRoute[],
 *       roles: {
 *         root: string[],
 *         global: string[],
 *         shared: string[],
 *         mapped: string[],
 *         dead: string[]
 *       }
 *     }
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing or invalid `projectRoot`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   500 Internal Server Error – Route analysis failed
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug(`[POST /routes] projectRoot='${projectRoot}'`);

    if (!projectRoot) {
        logger.warn("[POST /routes] Missing projectRoot");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn(`[POST /routes] tsconfig.json not found under '${projectRoot}'`);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph project
        logger.info(`[POST /routes] Initializing ts-morph project from ${tsConfig}`);
        const project = new Project({ tsConfigFilePath: tsConfig });

        // Phase 1: Discover all components for route-analysis
        logger.info('[POST /routes] Building component registry for route analysis…');
        const compRegistry: ComponentRegistry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info(
            `[POST /routes] Component registry built with ${compRegistry.components.length} components`
        );

        // Phase 2: Analyze routes
        logger.info('[POST /routes] Running RouteAnalyzer…');
        const analyzer = new RouteAnalyzer(project);
        const compRouteMap: ComponentRouteMap = await analyzer.analyzeProject(compRegistry);

        // Shallow-serialize the roles (selectors only)
        const dump = {
            routes: compRouteMap.routeMap.routes,
            redirections: compRouteMap.routeMap.redirections,
            roles: {
                root: compRouteMap.roles.root.map(c => c.selector),
                global: compRouteMap.roles.global.map(c => c.selector),
                shared: compRouteMap.roles.shared.map(c => c.selector),
                mapped: compRouteMap.roles.mapped.map(c => c.selector),
                dead: compRouteMap.roles.dead.map(c => c.selector),
            }
        };

        logger.info('[POST /routes] Analysis complete; returning routeMap with roles %o', dump.roles);

        return res.json({ success: true, routeMap: dump });
    } catch (err: any) {
        logger.error('[POST /routes] Fatal error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to analyze routes' });
    }
});

export default router;