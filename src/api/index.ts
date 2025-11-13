// ──────────────────────────────────────────────────────────────────────────────
// api/index.ts
//
// Static Analyzer API bootstrap:
//   • Setup the database connexion to the central app storage
//   • Creates an Express application
//   • Applies shared middleware (CORS, JSON parsing)
//   • Registers all feature routers in one place
//   • Exposes a lightweight health endpoint (/healthz)
//   • Installs a centralized error handler
//   • Starts the HTTP server on the configured port
// ──────────────────────────────────────────────────────────────────────────────

import express, { Express, Request, Response } from 'express';
import logger from '../logging/logger.js';
import { env } from './env.js';
import { corsMiddleware, errorHandler, jsonBodyParser } from './middleware.js';


import { Router } from 'express';
import fs from 'fs';
import path from 'path';


const app: Express = express();

// ── GLOBAL MIDDLEWARE ─────────────────────────────────────────────────────────
// Order matters: CORS first, then JSON parsing.
app.use(corsMiddleware);
app.use(jsonBodyParser);

// ── HEALTH ───────────────────────────────────────────────────────────────────
/**
 * Liveness/readiness probe.
 * Returns `{ ok: true }` and disables caching to avoid stale health checks.
 */
app.get("/healthz", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
/**
 * Centralized router registration keeps the bootstrap concise
 * and provides a one-glance overview of available endpoints.
 */


const router = Router();
await loadAndBuildRoutes(path.join(import.meta.dirname, "routes"), router);
app.use(router);


// ── ERROR HANDLING ────────────────────────────────────────────────────────────
// Should be registered after all route handlers.
app.use(errorHandler);

// ── START SERVER ───────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
    logger.info(`🚀 [Server] Listening on http://localhost:%d`, env.PORT);
    logger.info(
        '[Server] screenshots: storage=%s baseUrl=%s',
        env.SCREENSHOTS_STORAGE_ROOT,
        env.SCREENSHOTS_BASE_URL
    );
    logger.info(
        '[Server] llm: enabled=%s provider=%s',
        String(env.llm.enabled),
        env.llm.provider
    );
});








/** 
* Browse the routes directory and automatically call the building route function.
* It's avoid explicit import and addition of each declared routes.
*/
async function loadAndBuildRoutes(dir: string, router: Router) {
	
    const files = fs.readdirSync(dir);
    const exludedDir = [
        "helpers",
        "schemas",
        "utils"
    ]

    for (const file of files) {
        const filePath = path.join(dir, file);
        const fileStat = fs.statSync(filePath);

        if (exludedDir.includes(file))
            continue;

        if (fileStat.isDirectory())
            await loadAndBuildRoutes(filePath, router);
        else {
            const mod = await import(filePath);
            mod.default(router);
        }
    }
}
