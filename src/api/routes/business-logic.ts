// ──────────────────────────────────────────────────────────────────────────────
// api/routes/business-logic.ts
//
// Extracts business-logic event mappings for all widgets in the project.
//   - POST /business-logic
//     - Validates `projectRoot` param
//     - Ensures `tsconfig.json` exists
//     - Builds ComponentRegistry and RouteMap
//     - Runs `LogicAnalyzer` across the workspace
//     - Returns array of `WidgetEventMap`
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
 * Runs business-logic analysis to map widget events to call contexts.
 *
 * Request body:
 *   {
 *     projectRoot: string
 *   }
 *
 * Success Response (200):
 *   {
 *     success: true,
 *     widgetEventMaps: WidgetEventMap[]
 *   }
 *
 * Error Responses:
 *   400 Bad Request – Missing or invalid `projectRoot`
 *   400 Bad Request – `tsconfig.json` not found under `projectRoot`
 *   500 Internal Server Error – Business-logic analysis failed
 */
router.post('/', async (req: Request, res: Response) => {
  const { projectRoot } = req.body as { projectRoot?: string };
  logger.debug("[POST /business-logic] projectRoot=%o", projectRoot);

  if (!projectRoot) {
    logger.warn("[POST /business-logic] Missing projectRoot");
    return res
      .status(400)
      .json({ success: false, error: 'projectRoot is required' });
  }

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
    // Initialize project and registries
    logger.info(
      "[POST /business-logic] Initializing ts-morph project from %s",
      tsConfig
    );
    const project = new Project({ tsConfigFilePath: tsConfig });

    logger.info("[POST /business-logic] Building component registry…");
    const compRegistry = await new ComponentRegistryBuilder(project)
      .buildComponentsRegistry();
    logger.info(
      "[POST /business-logic] ComponentRegistry built with %d components",
      compRegistry.components.length
    );

    logger.info("[POST /business-logic] Analyzing routes…");
    const routeMap = await new RouteAnalyzer(project)
      .analyzeProject(compRegistry);
    logger.info(
      "[POST /business-logic] RouteMap contains %d routes, %d redirects",
      routeMap.routeMap.routes.length,
      routeMap.routeMap.redirections.length
    );

    // Run logic analysis
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

    return res.json({ success: true, widgetEventMaps });
  } catch (err: any) {
    logger.error("[POST /business-logic] Fatal error: %o", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || 'Business-logic analysis failed' });
  }
});

export default router;