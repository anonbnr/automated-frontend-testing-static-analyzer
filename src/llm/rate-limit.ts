// ──────────────────────────────────────────────────────────────────────────────
// llm/rate-limit.ts
//
//  Sliding-window (per-minute) rate limiter keyed by (analysisId, client IP).
//
//  What it does
//  ------------
//  • Enforces a maximum number of requests per 60s window for each (analysisId, IP).
//  • Returns HTTP 429 on excess with standards-friendly headers to guide backoff.
//  • Works in a **single-process** setup (in-memory counters).
//
//  What it does NOT do
//  -------------------
//  • Does not share state across processes/containers. For scale-out, we can replace it
//    with a shared store (e.g., Redis).
//  • Does not mutate req/res beyond rate-limit headers and 429 response.
//
//  Observability
//  -------------
//  • On success, sends:
//      X-RateLimit-Limit: <limit>
//      X-RateLimit-Remaining: <remaining tokens>
//      X-RateLimit-Reset: <unix seconds until reset>
//  • On 429, additionally sends:
//      Retry-After: <seconds>
// ──────────────────────────────────────────────────────────────────────────────

import { NextFunction, Request, Response } from 'express';

/** Internal counter for a single (analysisId, IP) bucket. */
type Counter = {
    /** Number of requests consumed in the current window. */
    count: number;
    /** Epoch millis when this bucket resets. */
    resetAt: number
};

/**
 * Create a per-minute rate limiter middleware.
 *
 * @param maxPerMinute Maximum allowed requests per 60s window, per (analysisId, IP).
 *
 * Headers added on *all* responses (success or 429):
 *  - X-RateLimit-Limit: configured limit
 *  - X-RateLimit-Remaining: remaining tokens (0 on rejection)
 *  - X-RateLimit-Reset: unix seconds when the window resets
 *
 * Additional header on 429:
 *  - Retry-After: seconds until reset
 */
export function makeRateLimiter(maxPerMinute: number) {
    // NOTE: in-memory storage — suitable for single instance only.
    const bucket = new Map<string, Counter>();
    const windowMs = 60_000;

    return function rateLimit(req: Request, res: Response, next: NextFunction) {
        // The caller may provide a correlation id so parallel analyses don't block each other.
        const analysisId = (req.body && req.body.analysisId) || 'unknown';

        // Determine client IP. Prefer the first X-Forwarded-For entry if present.
        // Make sure `app.set('trust proxy', true)` is used when behind a proxy.
        const ipHeader =
            (req.headers['x-forwarded-for'] as string) ||
            (req.headers['cf-connecting-ip'] as string) ||
            '';
        const firstForwarded = ipHeader.split(',')[0].trim();
        const ip = firstForwarded || req.ip || 'local';

        const key = `${analysisId}#${ip}`;
        const now = Date.now();

        // Get or (re)initialize the counter.
        let c = bucket.get(key);
        if (!c || c.resetAt < now) {
            c = { count: 0, resetAt: now + windowMs };
            bucket.set(key, c);
            return next();
        }

        // Consume a token if available.
        if (c.count < maxPerMinute) {
            c.count++;
            res.setHeader('X-RateLimit-Limit', String(maxPerMinute));
            res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxPerMinute - c.count)));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(c.resetAt / 1000)));
            return next();
        }

        // Otherwise reject with a 429.
        const retryAfterSec = Math.max(1, Math.ceil((c.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.setHeader('X-RateLimit-Limit', String(maxPerMinute));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(c.resetAt / 1000)));

        return res.status(429).json({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            hint: `Too many requests for this analysis. Try again in ~${retryAfterSec}s.`,
        });
    };
}