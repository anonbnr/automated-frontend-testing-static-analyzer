// ──────────────────────────────────────────────────────────────────────────────
// api/routes/business-logic.ts
//
// Express router: extracts business-logic event mappings for all widgets in an
// Angular workspace.
//
// Endpoint:
//   POST /business-logic
//
// Request body:
//   {
//     projectRoot: string   // absolute path to the Angular workspace root
//   }
//
// Processing pipeline:
//   1) Validate inputs and resolve `tsconfig.json` from `projectRoot`
//   2) Initialize a ts-morph Project from the resolved tsconfig
//   3) Build a ComponentRegistry (template → widgets & nested selectors)
//   4) Run RouteAnalyzer to get a ComponentRouteMap (routes + redirects)
//   5) Run LogicAnalyzer across the workspace to produce WidgetEventMap[]
//
// Success (200):
//   { success: true, widgetEventMaps: WidgetEventMap[] }
//
// Errors:
//   400 — missing `projectRoot`, or `tsconfig.json` not found
//   500 — unexpected failure during registry/route/logic analysis
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { Project } from 'ts-morph';
import { LogicAnalyzer } from '../../analyzers/business-logic/logic-analyzer.js';
import { RouteAnalyzer } from '../../analyzers/routes/route-analyzer.js';
import { ComponentRegistryBuilder } from '../../builders/component-registry-builder.js';
import logger from '../../logging/logger.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * POST /business-logic
 *
 * Runs business-logic analysis to map widget events to call contexts across
 * the entire Angular project. Internally:
 *  - Builds a ComponentRegistry (discover components, parse templates)
 *  - Builds a ComponentRouteMap (routes + redirects)
 *  - Runs LogicAnalyzer (walks component methods, handler bodies, router/service calls)
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/workspace" }
 * ```
 *
 * Response (200):
 * ```json
 * { "success": true, "widgetEventMaps": [ { "widgetID": "...", "eventContexts": [ ... ] }, ... ] }
 * ```
 *
 * Error Responses:
 *  - 400: `projectRoot` missing or `tsconfig.json` not found
 *  - 500: analysis failure (details in server logs)
 */
router.post('/', async (req: Request, res: Response) => {
	const { projectRoot } = req.body as { projectRoot?: string };
	logger.debug("[POST /business-logic] projectRoot=%o", projectRoot);

	// Validate required parameter
	if (!projectRoot) {
		logger.warn("[POST /business-logic] Missing projectRoot");
		return res
			.status(400)
			.json({ success: false, error: 'projectRoot is required' });
	}

	// Resolve the tsconfig.json path under projectRoot
	const tsConfig = resolveTsConfig(projectRoot);
	if (!tsConfig) {
		logger.warn(
			"[POST /business-logic] tsconfig.json not found under %s",
			projectRoot
		);
		return res
			.status(400)
			.json({ success: false, error: 'tsconfig.json not found in projectRoot' });
	}

	try {
		// Initialize ts-morph project
		logger.info(
			"[POST /business-logic] Initializing ts-morph project from %s",
			tsConfig
		);
		const project = new Project({ tsConfigFilePath: tsConfig });

		// Phase 1: Component registry (templates → widgets & nested selectors)
		logger.info("[POST /business-logic] Building component registry…");
		const compRegistry = await new ComponentRegistryBuilder(project)
			.buildComponentsRegistry();
		logger.info(
			"[POST /business-logic] ComponentRegistry built with %d components",
			compRegistry.components.length
		);

		// Phase 2: Route analysis (routes + redirects)
		logger.info("[POST /business-logic] Analyzing routes…");
		const routeMap = await new RouteAnalyzer(project)
			.analyzeProject(compRegistry);
		logger.info(
			"[POST /business-logic] RouteMap contains %d routes, %d redirects",
			routeMap.routeMap.routes.length,
			routeMap.routeMap.redirections.length
		);

		// Phase 3: Logic analysis (event → call contexts)
		logger.info(
			"[POST /business-logic] Running LogicAnalyzer across workspace…"
		);
		const logicAnalyzer = new LogicAnalyzer();
		const widgetEventMaps = logicAnalyzer.analyzeProject(
			project,
			compRegistry,
			routeMap.routeMap
		);
		logger.info(
			"[POST /business-logic] Completed analysis: %d WidgetEventMap",
			widgetEventMaps.length
		);

		// Success
		return res.json({ success: true, widgetEventMaps });
	} catch (err: any) {
		// Unhandled error: log and return 500
		logger.error("[POST /business-logic] Fatal error: %o", err);
		return res
			.status(500)
			.json({ success: false, error: err.message || 'Business-logic analysis failed' });
	}
});

export default router;