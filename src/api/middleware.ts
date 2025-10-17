// ──────────────────────────────────────────────────────────────────────────────
// api/middleware.ts
//
// Shared Express middleware for the StaticAnalyzer API:
//   - corsMiddleware   – enables CORS on all routes
//   - jsonBodyParser   – parses incoming JSON payloads
//   - errorHandler     – catches errors, logs them, and formats a JSON response
//
// Applied in api/index.ts to ensure consistent request handling and error reporting.
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
 * Parses incoming request bodies with `Content-Type: application/json`.
 * Populates `req.body` with the parsed JSON object.
 */
export const jsonBodyParser = bodyParser.json({
    limit: env.API_JSON_LIMIT,   // <= bumped from default 100kb
});

/**
 * Centralized error handler.  
 * Logs the full error to the console, then sends a standardized JSON response.
 *
 * @param err    - The error thrown in any route or middleware.
 * @param req    - The Express Request object.
 * @param res    - The Express Response object.
 * @param next   - The next middleware function in the stack.
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
    const status = err?.status || err?.statusCode || 500;
    const expose = err?.expose ?? true;
    const msg = (expose && err?.message) ? err.message : 'Internal Server Error';

    logger.error('[ErrorHandler] %s: %s', err?.name || 'Error', err?.stack || msg);
    res.status(status).json({ success: false, error: msg });
}
