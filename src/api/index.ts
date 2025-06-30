// ──────────────────────────────────────────────────────────────────────────────
// api/index.ts
//
// Entry point for the StaticAnalyzer API.  
// - Creates and configures an Express app  
// - Applies shared middleware (CORS, JSON body parsing)  
// - Mounts each feature router under its path  
// - Applies centralized error handler  
// - Starts the HTTP server on the configured port
// ──────────────────────────────────────────────────────────────────────────────

import express, { Express } from 'express';
import { corsMiddleware, errorHandler, jsonBodyParser } from './middleware.js';
import logicRouter from './routes/business-logic.js';
import componentsRouter from './routes/components.js';
import graphRouter from './routes/graph.js';
import modulesRouter from './routes/modules.js';
import routesRouter from './routes/routes.js';
import templateRouter from './routes/template.js';
import widgetIdRouter from './routes/widget-id.js';
import widgetsRouter from './routes/widgets.js';
import logger from '../logging/logger.js';

const app: Express = express();
const port = process.env.PORT ?? 3000;

// ── GLOBAL MIDDLEWARE ─────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(jsonBodyParser);

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/modules', modulesRouter);
app.use('/components', componentsRouter);
app.use('/routes', routesRouter);
app.use('/template', templateRouter);
app.use('/widgets', widgetsRouter);
app.use('/widget-id', widgetIdRouter);
app.use('/business-logic', logicRouter);
app.use('/graph', graphRouter);

// ── ERROR HANDLING ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── START SERVER ───────────────────────────────────────────────────────────────
app.listen(port, () => {
    logger.info(`🚀 [Server] Static Analyzer API listening on http://localhost:%d`, port);
});