// ──────────────────────────────────────────────────────────────────────────────
// api/index.ts
//
// Static Analyzer API bootstrap:
//  - Creates an Express app
//  - Applies shared middleware (CORS, JSON body parsing)
//  - Mounts feature routers
//  - Adds a tiny health endpoint
//  - Installs centralized error handler
//  - Starts the HTTP server
// ──────────────────────────────────────────────────────────────────────────────

import './env.js'; // .env is loaded and env is initialized first

import express, { Express, Request, Response } from 'express';
import logger from '../logging/logger.js';
import { corsMiddleware, errorHandler, jsonBodyParser } from './middleware.js';
import logicRouter from './routes/business-logic.js';
import componentsRouter from './routes/components.js';
import graphRouter from './routes/graph.js';
import modulesRouter from './routes/modules.js';
import routesRouter from './routes/routes.js';
import screenshotsRouter from './routes/screenshots.js';
import templateRouter from './routes/template.js';
import userJourneyRouter from './routes/user-journeys.js';
import widgetIdsRouter from './routes/widget-ids.js';
import widgetsRouter from './routes/widgets.js';

const app: Express = express();
const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3000);

// ── GLOBAL MIDDLEWARE ─────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(jsonBodyParser);

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/healthz", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
/** Centralized router registration keeps index clean and consistent. */
const ROUTES: Array<[path: string, router: any]> = [
    ["/modules", modulesRouter],
    ["/components", componentsRouter],
    ["/routes", routesRouter],
    ["/template", templateRouter],
    ["/widgets", widgetsRouter],
    ["/widget-ids", widgetIdsRouter],
    ["/business-logic", logicRouter],
    ["/graph", graphRouter],
    ["/user-journeys", userJourneyRouter],
    ["/screenshots", screenshotsRouter],
];

for (const [path, router] of ROUTES) app.use(path, router);

// ── ERROR HANDLING ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── START SERVER ───────────────────────────────────────────────────────────────
app.listen(port, () => {
    logger.info(`🚀 [Server] Static Analyzer API listening on http://localhost:%d`, port);
});