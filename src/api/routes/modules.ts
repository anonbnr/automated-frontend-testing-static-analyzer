// ──────────────────────────────────────────────────────────────────────────────
// api/routes/modules.ts
//
// Express router: discovers all NgModules in an Angular workspace and returns
// a fully annotated registry (including `lazy` flags after route analysis).
//
// Endpoint:
//   POST /modules
//
// Request body:
//   { projectRoot: string }   // absolute path to the Angular workspace root
//
// Behavior (high level):
//   1) Validate `projectRoot` and resolve its `tsconfig.json`
//   2) Build a ts-morph Project from that tsconfig
//   3) Phase 1 — ModuleRegistryBuilder.discoverModules()
//   4) Phase 2a — Build ComponentRegistry (template parsing) for route analysis
//   5) Phase 2b — RouteAnalyzer.analyzeProject(ComponentRegistry)
//   6) Phase 2c — ModuleRegistryBuilder.assignRoutesToModules(ComponentRouteMap)
//       • sets `route.module` on each route
//       • marks each ModuleInfo.lazy = true for any lazy-loaded targets
//   7) Respond with ModuleInfo[]
//
// Success (200):
//   { success: true, modules: ModuleInfo[] }
//
// Errors:
//   400 — missing/invalid `projectRoot`, or `tsconfig.json` not found
//   500 — any unexpected failure during discovery/analysis
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { ModuleRegistryBuilder } from '../../builders/module-registry-builder.js';
import logger from '../../logging/logger.js';
import { resolveTsConfig } from '../utils.js';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import { RouteAnalyzer } from '../../analyzers/routes/route-analyzer.js';

const router = Router();

/**
 * POST /modules
 *
 * Discovers, classifies, and annotates all NgModules in the given Angular workspace.
 *
 * Steps:
 *  - Validates input, resolves `tsconfig.json`
 *  - Initializes ts-morph Project
 *  - Phase 1: discover modules (roles without lazy flags)
 *  - Phase 2a: build ComponentRegistry (required for route analysis)
 *  - Phase 2b: analyze routes (normalize, dedupe, usage, roles)
 *  - Phase 2c: assign routes→modules and mark lazy modules
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace" }
 * ```
 *
 * Success (200):
 * ```json
 * {
 *   "success": true,
 *   "modules": [
 *     {
 *       "name": "AppModule",
 *       "filePath": ".../app.module.ts",
 *       "imports": ["BrowserModule","AppRoutingModule", "..."],
 *       "declarations": ["AppComponent", "..."],
 *       "exports": [],
 *       "lazy": false,
 *       "role": "root" | "routing" | "external" | "shared" | "global"
 *     },
 *     ...
 *   ]
 * }
 * ```
 *
 * Error (400):
 * ```json
 * { "success": false, "error": "projectRoot is required" }
 * ```
 *
 * Error (500):
 * ```json
 * { "success": false, "error": "Failed to discover modules" }
 * ```
 */
router.post('/', async (req: Request, res: Response) => {
    const { projectRoot } = req.body as { projectRoot?: string };
    logger.debug("[POST /modules] projectRoot: '%s'", projectRoot);

    // Basic param validation
    if (!projectRoot) {
        logger.warn("[POST /modules] Missing `projectRoot`");
        return res.status(400).json({ success: false, error: 'projectRoot is required' });
    }

    // Resolve tsconfig.json under projectRoot
    const tsConfig = resolveTsConfig(projectRoot);
    if (!tsConfig) {
        logger.warn("[POST /modules] tsconfig.json not found under %s", projectRoot);
        return res.status(400).json({ success: false, error: 'tsconfig.json not found in projectRoot' });
    }

    try {
        // Initialize ts-morph project and registry builder
        logger.info("[POST /modules] Initializing ts-morph project from %s", tsConfig);
        const project = new Project({ tsConfigFilePath: tsConfig });
        const builder = new ModuleRegistryBuilder(project);

        // ── Phase 1: discover modules (role classification; lazy not set yet)
        logger.info("[POST /modules] Discovering modules...");
        await builder.discoverModules();
        let modules = builder.registry.modules;
        logger.info("[POST /modules] Discovered %d modules", modules.length);

        // ── Phase 2a: build ComponentRegistry (template-derived metadata)
        const compReg = await new ComponentRegistryBuilder(project)
            .buildComponentsRegistry();

        // ── Phase 2b: route analysis (routes, redirects, usage, roles)
        const routeAnlz = new RouteAnalyzer(project);
        const compRouteMap = await routeAnlz.analyzeProject(compReg);

        // ── Phase 2c: assign routes→modules & mark lazy modules
        builder.assignRoutesToModules(compRouteMap);

        // Read back the updated registry (lazy flags now accurate)
        modules = builder.registry.modules;

        // Success
        return res.json({ success: true, modules });

    } catch (err: any) {
        // Unhandled error: log and return 500
        logger.error("[POST /modules] Fatal error: %o", err);
        return res
            .status(500)
            .json({ success: false, error: err.message || 'Failed to discover modules' });
    }
});

export default router;