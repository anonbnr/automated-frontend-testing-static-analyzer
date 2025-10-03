// ──────────────────────────────────────────────────────────────────────────────
// api/routes/user-journeys.ts
//
// Builds and returns all user journeys for an Angular workspace.
//
//   POST /user-journeys
//   ---------------
//   Body:
//     {
//       "projectRoot": string,                // required (absolute or cwd-relative)
//       "fanoutMode"?: "primary"|"collapse",  // optional (default "primary")
//       "maxDepth"?: number                   // optional (reserved; not wired yet)
//     }
//
//   200 OK:
//     { success: true, journeys: UserJourneys[] }
//
//   4xx/5xx with a concise error message otherwise.
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from "express";
import { performance } from "node:perf_hooks";
import { FanoutMode } from "../../builders/user-journeys/user-journey-processors.js";
import logger from "../../logging/logger.js";
import { ExtractOptions, UserJourneyExtractor } from "../../orchestrators/user-journey-extractor.js";
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
 * POST /user-journeys
 *
 * Builds and returns all user journeys for an Angular app.
 */
router.post("/", async (req: Request, res: Response) => {
    const started = performance.now();

    try {
        const { projectRoot, opts } = parseBody(req.body);

        const tsConfig = resolveTsConfig(projectRoot);
        if (!tsConfig) {
            logger.warn("[POST /user-journeys] tsconfig.json not found under %s", projectRoot);
            return res
                .status(400)
                .json({ success: false, error: "tsconfig.json not found in projectRoot" });
        }

        logger.info(
            "[POST /user-journeys] Extracting (root=%s, fanout=%s, maxDepth=%s)",
            projectRoot,
            opts.fanoutMode ?? "primary",
            opts.maxDepth ?? "-"
        );

        const extractor = new UserJourneyExtractor(tsConfig);
        const registry = await extractor.extract(opts);
        const journeys = registry.getAll();

        // Response headers for observability and cache behavior
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-User-Journeys-Count", String(journeys.length));
        res.setHeader("X-Analyzer-DurationMs", (performance.now() - started).toFixed(1));

        return res.status(200).json({ success: true, journeys });
    } catch (err: any) {
        const status = Number.isInteger(err?.status) ? err.status : 500;
        const msg =
            status === 400 ? err?.message || "Bad request" : err?.message || "Failed to extract user journeys";

        logger.error("[POST /user-journeys] Error: %o", err);
        return res.status(status).json({ success: false, error: msg });
    }
});

export default router;