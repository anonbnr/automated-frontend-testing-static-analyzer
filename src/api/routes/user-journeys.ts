// ──────────────────────────────────────────────────────────────────────────────
// api/routes/user-journeys.ts
//
// Express router: builds and returns all user journeys for an Angular workspace.
// Internally runs (or reuses) the static analysis graph and then assembles,
// pre/post-processes, and labels user journeys.
//
// Endpoint:
//   POST /user-journeys
//
// Request body:
//   {
//     "projectRoot": string,                // required; absolute or cwd-relative path
//     "fanoutMode"?: "primary" | "collapse",// optional; default "primary"
//     "maxDepth"?: number                   // optional; reserved for future analyzer tuning
//   }
//
// Processing steps:
//   1) Validate input body and resolve `tsconfig.json` under `projectRoot`
//   2) Orchestrate extraction via UserJourneyExtractor (uses cache when possible)
//   3) Return the final list from the UserJourneyRegistry
//
// Success (200):
//   {
//     "success": true,
//     "journeys": UserJourney[]            // flat array of journeys (already post-processed + labeled)
//   }
//
// Error responses:
//   400 — invalid body (missing/invalid fields) OR tsconfig.json not found
//   500 — unexpected failure during analysis or extraction
//
// Response headers (observability):
//   Cache-Control: no-store
//   X-User-Journeys-Count: <number>        // total journeys in the response
//   X-Analyzer-DurationMs: <number.ms>     // end-to-end time spent within this handler
//
// Example request (JSON):
//   {
//     "projectRoot": "/path/to/workspace",
//     "fanoutMode": "collapse"
//   }
//
// Example success (200):
//   {
//     "success": true,
//     "journeys": [
//       {
//         "id": "app-root→/home[click]→/orders",
//         "rootModule": "app-root",
//         "steps": [...],
//         "intent": "Orders",
//         "success": true
//       },
//       ...
//     ]
//   }
//
// Example error (400):
//   { "success": false, "error": "tsconfig.json not found in projectRoot" }
//
// Notes:
//   - This endpoint is stateless from the client's perspective but leverages an
//     in-process cache for analysis artifacts (graph, routes, journeys).
//   - `fanoutMode="primary"` keeps sibling journeys and annotates the primary
//     with a compound summary; `collapse` keeps only the primary (collapsing
//     backend tails to `/virtual/backend`).
// ──────────────────────────────────────────────────────────────────────────────

import { Request, Response, Router } from "express";
import { performance } from "node:perf_hooks";
import { FanoutMode } from "../../builders/user-journeys/user-journey-processors.js";
import logger from "../../logging/logger.js";
import { ExtractOptions, UserJourneyExtractor } from "../../orchestrators/user-journey-extractor.js";
import { resolveTsConfig } from "../utils.js";

const router = Router();

/**
 * Parses and validates the POST body for /user-journeys.
 * Throws an Error with .status=400 on invalid input.
 *
 * Accepted fields:
 *  - projectRoot: non-empty string (required)
 *  - fanoutMode: "primary" | "collapse" (optional)
 *  - maxDepth: non-negative number (optional; reserved)
 *
 * @param body Untrusted request body
 * @returns { projectRoot, opts } The sanitized values
 */
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
 * Builds and returns all user journeys for an Angular app given a project root.
 * Uses caching underneath for fast subsequent calls.
 *
 * Request Body:
 * ```json
 * { "projectRoot": "/abs/path", "fanoutMode": "primary" }
 * ```
 *
 * Response (200):
 * ```json
 * { "success": true, "journeys": [ ... ] }
 * ```
 */
router.post("/", async (req: Request, res: Response) => {
    const started = performance.now();

    try {
        // 1) Validate inputs
        const { projectRoot, opts } = parseBody(req.body);

        // 2) Resolve tsconfig.json under projectRoot
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

        // 3) Orchestrate extraction
        const extractor = new UserJourneyExtractor(tsConfig);
        const registry = await extractor.extract(opts, projectRoot);
        const journeys = registry.getAll();

        // 4) Observability headers
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-User-Journeys-Count", String(journeys.length));
        res.setHeader("X-Analyzer-DurationMs", (performance.now() - started).toFixed(1));

        // 5) Success
        return res.status(200).json({ success: true, journeys });
    } catch (err: any) {
        // Validation errors bubble up with .status=400; unknowns default to 500
        const status = Number.isInteger(err?.status) ? err.status : 500;
        const msg =
            status === 400 ? err?.message || "Bad request" : err?.message || "Failed to extract user journeys";

        logger.error("[POST /user-journeys] Error: %o", err);
        return res.status(status).json({ success: false, error: msg });
    }
});

export default router;