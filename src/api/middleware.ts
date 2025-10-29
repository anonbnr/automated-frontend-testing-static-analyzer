// ──────────────────────────────────────────────────────────────────────────────
// api/middleware.ts
//
// Shared Express middleware for the StaticAnalyzer API:
//   • corsMiddleware  – enable CORS for cross-origin clients
//   • jsonBodyParser  – parse incoming JSON payloads
//   • errorHandler    – centralized error-to-JSON response formatter
//
// Applied in api/index.ts to ensure consistent request handling and reporting.
// ──────────────────────────────────────────────────────────────────────────────

import bodyParser from 'body-parser';
import cors from 'cors';
import { NextFunction, Request, Response } from 'express';
import logger from '../logging/logger.js';
import { env } from './env.js';

/**
 * Enables Cross-Origin Resource Sharing (CORS) for all incoming requests.
 * Allows the API to be consumed by clients hosted on a different origin.
 */
export const corsMiddleware = cors();

/**
 * JSON body parser with an increased limit (configurable via env).
 * Populates `req.body` for routes that accept JSON payloads.
 */
export const jsonBodyParser = bodyParser.json({
    // Raised from Express default to accommodate large analyses.
    limit: env.API_JSON_LIMIT,
});

/**
 * Centralized error handler.
 *
 * Behavior:
 *   • Picks an HTTP status from `err.status`/`err.statusCode` (default 500).
 *   • If `err.expose` is true (default), returns `err.message`; otherwise a generic message.
 *   • Logs the full error (with stack) for diagnostics.
 *
 * Always returns a JSON response of the form:
 *   { success: false, error: string }
 *
 * @param err  - Error thrown from routes or middleware.
 * @param _req - Express Request (unused).
 * @param res  - Express Response used to send the JSON error.
 * @param _next - Next function (unused).
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
    const status = err?.status || err?.statusCode || 500;
    const expose = err?.expose ?? true;
    const msg = (expose && err?.message) ? err.message : 'Internal Server Error';

    // Log full stack if present; otherwise fall back to message.
    logger.error('[ErrorHandler] %s: %s', err?.name || 'Error', err?.stack || msg);
    res.status(status).json({ success: false, error: msg });
}