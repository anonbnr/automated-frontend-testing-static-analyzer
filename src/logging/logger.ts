// ──────────────────────────────────────────────────────────────────────────────
// logging/logger.ts
//
// Defines and exports a singleton **Winston** logger instance
// for the StaticAnalyzer backend.
//
// Responsibilities:
//   • Create a persistent `logs/` directory (if missing).
//   • Configure daily‐rotated JSON log files:
//       – `error-YYYY-MM-DD.log`   → level ≥ error
//       – `combined-YYYY-MM-DD.log` → level ≥ trace (all messages)
//   • Provide a colorized, human-readable console output in development.
//   • Handle uncaught exceptions and unhandled promise rejections.
//
// Design notes:
//   • Uses winston-daily-rotate-file for automatic daily log rotation.
//   • Emits structured JSON logs for machine readability.
//   • The console output remains concise and colorized for human users.
//   • Custom log levels (trace/debug/info/warn/error) allow fine control.
//
// Usage:
//   ```ts
//   import logger from '../logging/logger.js';
//   logger.info('Analyzer started');
//   logger.error('Unexpected failure: %o', err);
//   ```
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { addColors, createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';

// ──────────────────────────────────────────────────────────────────────────────
// Resolve filesystem paths
// Winston uses ESM; emulate __dirname via fileURLToPath.
// ──────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────────────────────────────────────
// Ensure the logs directory exists (one level above `src/logging/`).
// ──────────────────────────────────────────────────────────────────────────────
const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir))
    mkdirSync(logDir, { recursive: true });

// ──────────────────────────────────────────────────────────────────────────────
// Define custom logging levels and associated console colors.
// Lower number = higher priority.
// ──────────────────────────────────────────────────────────────────────────────
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue',
        trace: 'grey'
    }
};

// Register custom colors with Winston for console output
addColors(customLevels.colors);

// ──────────────────────────────────────────────────────────────────────────────
// Create the singleton Winston logger instance.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Winston logger instance configured with:
 *  • Console transport (colorized output in dev)
 *  • DailyRotateFile transport for `error` logs
 *  • DailyRotateFile transport for combined logs
 *  • Exception/rejection handlers for robustness
 *
 * File outputs are in JSON for structured log ingestion;
 * Console output remains formatted for readability.
 */
const logger = createLogger({
    levels: customLevels.levels,

    // Default log level: verbose in dev, quieter in production
    level: process.env.NODE_ENV === 'production' ? 'info' : 'trace',

    // Base format: timestamped structured JSON for file outputs
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }), // preserve stack traces
        format.splat(), // enable printf-style placeholders (%s, %d, etc.)
        format.json() // file logs stored as JSON
    ),

    // ──────────────────────────────────────────────────────────────────────────
    // Define transports (output targets)
    // ──────────────────────────────────────────────────────────────────────────
    transports: [
        // Console: human-readable, colorized, minimal metadata
        new transports.Console({
            format: format.combine(
                format.colorize({ all: true }),
                format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    const msg = stack || message;
                    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                    return `${timestamp} ${level}: ${msg} ${metaStr}`;
                })
            )
        }),

        // File: errors only, rotated daily
        new transports.DailyRotateFile({
            dirname: logDir,
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '14d' // retain 14 days of logs
        }),

        // File: all logs (trace/debug/info/warn/error), rotated daily
        new transports.DailyRotateFile({
            dirname: logDir,
            filename: 'combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'trace',
            maxFiles: '14d'
        })
    ],

    // ──────────────────────────────────────────────────────────────────────────
    // Capture runtime errors to persistent files
    // ──────────────────────────────────────────────────────────────────────────
    exceptionHandlers: [
        new transports.File({ filename: path.join(logDir, 'exceptions.log') })
    ],
    rejectionHandlers: [
        new transports.File({ filename: path.join(logDir, 'rejections.log') })
    ]
});

// ──────────────────────────────────────────────────────────────────────────────
// Export singleton instance for use across all modules.
// ──────────────────────────────────────────────────────────────────────────────
export default logger;