// ──────────────────────────────────────────────────────────────────────────────
// logging/logger.ts
//
// Singleton Winston logger for the StaticAnalyzer API.
//
// Responsibilities:
//   - Creates `logs/` directory (if missing) alongside this module.
//   - Writes daily‐rotated JSON logs under `logs/`:
//       - `error-YYYY-MM-DD.log` for errors (level ≥ error)
//       - `combined-YYYY-MM-DD.log` for all messages (level ≥ debug/info)
//   - Outputs colorized, human‐readable logs to the console in non‐production.
//   - Captures uncaught exceptions and promise rejections.
//   - Exports a single `logger` instance for use across the codebase.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { addColors, createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';

// Helpers to emulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure log directory exists
const logDir = join(__dirname, '../../logs');
if (!existsSync(logDir))
    mkdirSync(logDir, { recursive: true });

// 1) Define custom log levels and colors
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

// 2) Tell Winston about your colors
addColors(customLevels.colors);



/**
 * Winston logger instance configured with:
 *  - Console transport for human‐readable output (colorized in dev)
 *  - DailyRotateFile for `error`-level logs
 *  - DailyRotateFile for all logs
 *  - Exception & rejection handlers
 *
 * Levels:
 *  - `error` → goes to error-*.log
 *  - `info` and above → go to combined-*.log
 *  - `debug` and above → console in non-production
 */
const logger = createLogger({
    levels: customLevels.levels,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'trace',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),               // include stack trace in error logs
        format.splat(),                               // enable printf-style `%d` formatting
        format.json()                                 // output as JSON for files
    ),
    transports: [
        // ──────────────────────────────────────────────────────────────────────────
        // Console transport (colorized) for development
        // ──────────────────────────────────────────────────────────────────────────
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

        // ──────────────────────────────────────────────────────────────────────────
        // Daily rotated file for errors only (level ≥ error)
        // ──────────────────────────────────────────────────────────────────────────
        new transports.DailyRotateFile({
            dirname: logDir,
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '14d'
        }),

        // ──────────────────────────────────────────────────────────────────────────
        // Daily rotated file for all logs (level ≥ debug/info)
        // ──────────────────────────────────────────────────────────────────────────
        new transports.DailyRotateFile({
            dirname: logDir,
            filename: 'combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'trace',
            maxFiles: '14d'
        })
    ],
    // ──────────────────────────────────────────────────────────────────────────
    // Handle uncaught exceptions and promise rejections
    // ──────────────────────────────────────────────────────────────────────────
    exceptionHandlers: [
        new transports.File({ filename: path.join(logDir, 'exceptions.log') })
    ],
    rejectionHandlers: [
        new transports.File({ filename: path.join(logDir, 'rejections.log') })
    ]
});

export default logger;
