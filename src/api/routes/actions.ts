// ──────────────────────────────────────────────────────────────────────────────
// api/routes/actions.ts
//
// M1.4 router that exposes StageAction DSL parsing + default action inference.
//   • POST /actions/parse  — parse the tiny DSL into StageAction[]
//   • POST /actions/infer  — derive StageAction[] from a UserJourney + Graph
//
// Response headers:
//   - Cache-Control: no-store
//   - X-StageActions-Count
//   - X-Analyzer-DurationMs
//
// Errors are shaped with { success:false, error: string } and 4xx/5xx status.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from "express";
import { performance } from "node:perf_hooks";
import { inferActions } from "../../builders/scenarios/action-inferer.js";
import logger from "../../logging/logger.js";
import { AppNavigation } from "../../models/navigation-graph.js";
import { UserJourney } from "../../models/user-journeys/user-journey-info.js";
import { parseActions } from "../../parsers/stage-action-dsl.js";

const router = Router();

/** Small guard to produce concise 400s with hints. */
function badRequest(res: Response, msg: string) {
    return res.status(400).json({ success: false, error: msg });
}

/**
 * POST /actions/parse
 * Body: { script: string }
 *  -> 200 { success: true, actions, diagnostics }
 */
router.post("/parse", (req: Request, res: Response) => {
    const started = performance.now();
    try {
        const script = String(req.body?.script ?? "");
        if (!script.trim()) {
            return badRequest(res, "Body.script is required and must be a non-empty string.");
        }

        logger.info("[POST /actions/parse] len=%d", script.length);
        const { actions, diagnostics } = parseActions(script);

        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-StageActions-Count", String(actions.length));
        res.setHeader("X-Analyzer-DurationMs", (performance.now() - started).toFixed(1));

        // Note: success = true even if diagnostics contain warnings; client decides.
        return res.status(200).json({ success: true, actions, diagnostics });
    } catch (err: any) {
        logger.error("[POST /actions/parse] Error: %o", err);
        return res.status(500).json({ success: false, error: err?.message || "Failed to parse StageAction DSL" });
    }
});

/**
 * POST /actions/infer
 * Body: { journey: UserJourney, graph?: AppNavigation|null }
 *  -> 200 { success: true, actions }
 */
router.post("/infer", (req: Request, res: Response) => {
    const started = performance.now();
    try {
        const journey = req.body?.journey as UserJourney | undefined;
        const graph = (req.body?.graph ?? null) as AppNavigation | null;
        const widgetIdsRaw = req.body?.widgetIds;


        if (!journey || !Array.isArray(journey.steps)) {
            return badRequest(res, "Body.journey is required and must include a 'steps' array.");
        }

        const widgetIds = Array.isArray(widgetIdsRaw) ? widgetIdsRaw.filter((s: any) => typeof s === 'string') : undefined;

        logger.info(
            "[POST /actions/infer] journey=%s steps=%d graphNodes=%d catalog=%d",
            journey.id ?? "<no-id>",
            journey.steps.length,
            Array.isArray(graph?.nodes) ? graph!.nodes.length : 0,
            widgetIds?.length ?? 0
        );

        const actions = inferActions(journey, graph, { widgetIds });

        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-StageActions-Count", String(actions.length));
        res.setHeader("X-WidgetCatalog-Count", String(widgetIds?.length ?? 0));
        res.setHeader("X-Analyzer-DurationMs", (performance.now() - started).toFixed(1));

        return res.status(200).json({ success: true, actions });
    } catch (err: any) {
        logger.error("[POST /actions/infer] Error: %o", err);
        return res.status(500).json({ success: false, error: err?.message || "Failed to infer StageActions" });
    }
});

export default router;
