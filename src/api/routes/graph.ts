// ──────────────────────────────────────────────────────────────────────────────
// api/routes/graph.ts
//
// Runs the full StaticAnalyzer pipeline to produce the navigation graph.
//   - POST /graph
//     - Validates `projectRoot` param
//     - Ensures `tsconfig.json` exists
//     - Uses `StaticAnalyzer` to build `AppNavigation`
//     - Returns the complete graph (nodes, edges, transitions)
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from 'express';
import logger from '../../logging/logger.js';
import { StaticAnalyzer } from '../../orchestrators/static-analyzer.js';
import { resolveTsConfig } from '../utils.js';
import { getNavigationGraph, setNavigationGraph } from '../../adapters/appCache.js';
import { UnsupportedOperation } from 'puppeteer';

const router = Router();

/**
 * POST /graph
 *
 * Builds the complete navigation multigraph for an Angular app.
 *
 * Request body:
 *   {
 *     projectRoot: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     graph: AppNavigation
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing or invalid `projectRoot`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   500 Internal Server Error – Graph construction failed
 */
router.post('/', async (req: Request, res: Response) => {
  const { projectRoot } = req.body as { projectRoot?: string };
  logger.debug("[POST /graph] projectRoot=%o", projectRoot);

  if (!projectRoot) {
    logger.warn("[POST /graph] Missing projectRoot");
    return res
      .status(400)
      .json({ success: false, error: 'projectRoot is required' });
  }

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
    logger.info(
      "[POST /graph] Initializing ts-morph project from %s",
      tsConfig
    );
    const analyzer = new StaticAnalyzer(tsConfig);
    
    let graph = getNavigationGraph(projectRoot);
    if (!graph) {
      graph = await analyzer.analyze();
      setNavigationGraph(projectRoot, graph);
    }
    else {
      logger.info("[POST /graph] Getting navigation graph from cache");
    }

    logger.info(
      "[POST /graph] built navigation graph: nodes=%d, edges=%d, transitions=%d",
      graph.nodes.length,
      graph.edges.length,
      graph.transitions.length
    );

    return res.json({ success: true, graph });
  } catch (err: any) {
    logger.error('[POST /graph] Error building graph: %o', err);
    return res
      .status(500)
      .json({ success: false, error: err.message || 'Failed to build navigation graph' });
  }
});

export default router;