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

/**
 * Enables Cross-Origin Resource Sharing (CORS) for all incoming requests.
 * Allows the API to be consumed by clients hosted on a different origin.
 */
export const corsMiddleware = cors();

/**
 * Parses incoming request bodies with `Content-Type: application/json`.
 * Populates `req.body` with the parsed JSON object.
 */
export const jsonBodyParser = bodyParser.json();

/**
 * Centralized error handler.  
 * Logs the full error to the console, then sends a standardized JSON response.
 *
 * @param err    - The error thrown in any route or middleware.
 * @param req    - The Express Request object.
 * @param res    - The Express Response object.
 * @param next   - The next middleware function in the stack.
 */
export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) {
    logger.error('[ErrorHandler] %o', err);
    res
        .status(err.status || 500)
        .json({
            success: false,
            error: err.message || 'Internal Server Error'
        });
}
