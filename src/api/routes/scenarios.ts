// ──────────────────────────────────────────────────────────────────────────────
// api/routes/scenarios.ts
//
// Builds and returns all user-journey scenarios for an Angular workspace.
//
//   POST /scenarios
//   ---------------
//   Body:
//     {
//       "projectRoot": string,                // required (absolute or cwd-relative)
//       "fanoutMode"?: "primary"|"collapse",  // optional (default "primary")
//       "maxDepth"?: number                   // optional (reserved; not wired yet)
//     }
//
//   200 OK:
//     { success: true, scenarios: Scenario[] }
//
//   4xx/5xx with a concise error message otherwise.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from "express";
import { performance } from "node:perf_hooks";
import { FanoutMode } from "../../builders/scenarios/scenario-processors.js";
import logger from "../../logging/logger.js";
import { ExtractOptions, ScenarioExtractor } from "../../orchestrators/scenario-extractor.js";
import { resolveTsConfig } from "../utils.js";

const router = Router();

/** Lightweight body validation with helpful error messages. */
function parseBody(body: any): { projectRoot: string; opts: ExtractOptions } {
    const errors: string[] = [];

    const projectRoot =
        typeof body?.projectRoot === "string" && body.projectRoot.trim()
            ? String(body.projectRoot)
            : "";

    if (!projectRoot) {
        errors.push("projectRoot is required and must be a non-empty string.");
    }

    let fanoutMode: FanoutMode | undefined;
    if (body?.fanoutMode !== undefined) {
        const v = String(body.fanoutMode).trim();
        if (v === "primary" || v === "collapse") fanoutMode = v as FanoutMode;
        else errors.push('fanoutMode, when provided, must be "primary" or "collapse".');
    }

    let maxDepth: number | undefined;
    if (body?.maxDepth !== undefined) {
        const n = Number(body.maxDepth);
        if (Number.isFinite(n) && n >= 0) maxDepth = n;
        else errors.push("maxDepth, when provided, must be a non-negative number.");
    }

    if (errors.length) {
        const err = new Error(errors.join(" "));
        (err as any).status = 400;
        throw err;
    }

    return { projectRoot, opts: { fanoutMode, maxDepth } };
}

/**
 * POST /scenarios
 *
 * Builds and returns all user‐journey scenarios for an Angular app.
 */
router.post("/", async (req: Request, res: Response) => {
    const started = performance.now();

    try {
        const { projectRoot, opts } = parseBody(req.body);

        const tsConfig = resolveTsConfig(projectRoot);
        if (!tsConfig) {
            logger.warn("[POST /scenarios] tsconfig.json not found under %s", projectRoot);
            return res
                .status(400)
                .json({ success: false, error: "tsconfig.json not found in projectRoot" });
        }

        logger.info(
            "[POST /scenarios] Extracting (root=%s, fanout=%s, maxDepth=%s)",
            projectRoot,
            opts.fanoutMode ?? "primary",
            opts.maxDepth ?? "-"
        );

        const extractor = new ScenarioExtractor(tsConfig);
        const registry = await extractor.extract(opts);
        const scenarios = registry.getAll();

        // Response headers for observability and cache behavior
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Scenarios-Count", String(scenarios.length));
        res.setHeader("X-Analyzer-DurationMs", (performance.now() - started).toFixed(1));

        return res.status(200).json({ success: true, scenarios });
    } catch (err: any) {
        const status = Number.isInteger(err?.status) ? err.status : 500;
        const msg =
            status === 400 ? err?.message || "Bad request" : err?.message || "Failed to extract scenarios";

        logger.error("[POST /scenarios] Error: %o", err);
        return res.status(status).json({ success: false, error: msg });
    }
});

export default router;