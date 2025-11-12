// ──────────────────────────────────────────────────────────────────────────────
// api/routes/graph.ts
//
// Express router: runs the full StaticAnalyzer pipeline to generate the
// complete AppNavigation multigraph for an Angular workspace.
//
// Endpoint:
//   POST /graph
//
// Workflow:
//   1) Validate request (ensure `projectRoot` is provided)
//   2) Resolve `tsconfig.json` within projectRoot
//   3) Instantiate StaticAnalyzer and run full analysis pipeline
//   4) Cache results for subsequent requests
//   5) Return the resulting AppNavigation graph (nodes, edges, transitions)
//
// Success (200):
//   { success: true, graph: AppNavigation }
//
// Errors:
//   400 — missing projectRoot or tsconfig not found
//   500 — internal analysis or graph-building error
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import { getNavigationGraph, setNavigationGraph } from '../../adapters/appCache.js';
import logger from '../../logging/logger.js';
import { StaticAnalyzer } from '../../orchestrators/static-analyzer.js';
import { resolveTsConfig } from '../utils.js';

const router = Router();

/**
 * POST /graph
 *
 * Executes the full multi-phase static analysis pipeline for an Angular project
 * and returns the resulting navigation graph (AppNavigation).
 *
 * Steps performed:
 *  1. Validate and resolve `projectRoot` → `tsconfig.json`
 *  2. Run StaticAnalyzer, which internally:
 *      - discovers modules
 *      - discovers components and widgets
 *      - analyzes routes & component roles
 *      - builds static graph (modules/routes/components/widgets)
 *      - builds dynamic graph (router links, events, lazy-loads, etc.)
 *  3. Returns `{ nodes, edges, transitions }`
 *
 * Uses a cache layer (via appCache) to reuse previously built graphs for the
 * same `projectRoot`.
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path/to/angular/workspace" }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "graph": {
 *      "nodes": [...],
 *      "edges": [...],
 *      "transitions": [...]
 *   }
 * }
 * ```
 *
 * Error Responses:
 *  - 400: Missing or invalid `projectRoot`
 *  - 400: tsconfig.json not found
 *  - 500: Internal analysis failure
 */
router.post('/', async (req: Request, res: Response) => {
	const { projectRoot } = req.body as { projectRoot?: string };
	logger.debug("[POST /graph] projectRoot=%o", projectRoot);

	// Validate required parameter
	if (!projectRoot) {
		logger.warn("[POST /graph] Missing projectRoot");
		return res
			.status(400)
			.json({ success: false, error: 'projectRoot is required' });
	}

	// Resolve the tsconfig.json path under projectRoot
	const tsConfig = resolveTsConfig(projectRoot);
	if (!tsConfig) {
		logger.warn(
			"[POST /graph] tsconfig.json not found under %s",
			projectRoot
		);
		return res
			.status(400)
			.json({ success: false, error: 'tsconfig.json not found in projectRoot' });
	}

	try {
		// Initialize the StaticAnalyzer orchestrator
		logger.info(
			"[POST /graph] Initializing ts-morph project from %s",
			tsConfig
		);
		const analyzer = new StaticAnalyzer(tsConfig);
		
		// Check cache to avoid redundant analysis
		let graph = getNavigationGraph(projectRoot);
		
		if (!graph) {
			graph = await analyzer.analyze();
			setNavigationGraph(projectRoot, graph, analyzer.compRouteMap);
		}
		else {
			logger.info("[POST /graph] Getting navigation graph from cache");
		}

		// Log and return final graph statistics
		logger.info(
			"[POST /graph] built navigation graph: nodes=%d, edges=%d, transitions=%d",
			graph.nodes.length,
			graph.edges.length,
			graph.transitions.length
		);

		return res.json({ success: true, graph });
	} catch (err: any) {
		// Unhandled error: log and return 500
		logger.error('[POST /graph] Error building graph: %o', err);
		return res
			.status(500)
			.json({ success: false, error: err.message || 'Failed to build navigation graph' });
	}
});

export default router;