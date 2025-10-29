// ──────────────────────────────────────────────────────────────────────────────
// api/routes/routes.ts
//
// Express router: runs Angular routing analysis and returns a shallow-serialized
// ComponentRouteMap (routes, redirections, and role buckets by selector).
//
// Endpoint:
//   POST /routes
//
// Request body:
//   { projectRoot: string }   // absolute path to the Angular workspace root
//
// High-level flow:
//   1) Validate `projectRoot` and resolve its `tsconfig.json`
//   2) Build a ts-morph Project from that tsconfig
//   3) Build ComponentRegistry (template-derived metadata)
//   4) Run RouteAnalyzer.analyzeProject(...) to compute ComponentRouteMap
//   5) Shallow-serialize roles (selectors only) for transport
//   6) Return routes, redirections, and roles
//
// Success (200):
//   { success: true, routeMap: { routes, redirections, roles:{root[],global[],shared[],mapped[],dead[]} } }
//
// Errors:
//   400 — missing/invalid `projectRoot`, or `tsconfig.json` not found
//   500 — any unexpected failure during analysis
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
 * Builds a ComponentRegistry, runs the RouteAnalyzer, and returns a shallow
 * serialization of the ComponentRouteMap (including role buckets by selector).
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
 *   "routeMap": {
 *     "routes": [ /* ComponentRoute[] *\/ ],
 *     "redirections": [ /* RedirectRoute[] *\/ ],
 *     "roles": {
 *       "root":   ["app-root", ...],
 *       "global": ["app-header", ...],
 *       "shared": ["app-card", ...],
 *       "mapped": ["app-dashboard", ...],
 *       "dead":   ["app-legacy", ...]
 *     }
 *   }
 * }
 * ```
 *
 * Errors:
 *  - 400: `projectRoot` missing/invalid, or `tsconfig.json` not found
 *  - 500: analysis failure
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug(`[POST /routes] projectRoot='${projectRoot}'`);

    // Basic param validation
    if (!projectRoot) {
        logger.warn("[POST /routes] Missing projectRoot");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    // Resolve tsconfig.json under projectRoot
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn(`[POST /routes] tsconfig.json not found under '${projectRoot}'`);
        return res
            .status(400)
            .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph Project from the resolved tsconfig
        logger.info(`[POST /routes] Initializing ts-morph project from ${tsConfig}`);
        const project = new Project({ tsConfigFilePath: tsConfig });

        // Phase 1: Build ComponentRegistry (template parsing → widgets & nested selectors)
        logger.info('[POST /routes] Building component registry for route analysis…');
        const compRegistry: ComponentRegistry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        logger.info(
            `[POST /routes] Component registry built with ${compRegistry.components.length} components`
        );
        
        // Phase 2: Run RouteAnalyzer over the discovered components
        logger.info('[POST /routes] Running RouteAnalyzer…');
        const analyzer = new RouteAnalyzer(project);
        const compRouteMap: ComponentRouteMap = await analyzer.analyzeProject(compRegistry);

        // Shallow-serialize role buckets to avoid returning full ComponentInfo objects
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

        // Success response
        return res.json({ success: true, routeMap: dump });
    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error('[POST /routes] Fatal error: %o', err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to analyze routes' });
    }
});

export default router;