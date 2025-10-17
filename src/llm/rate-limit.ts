// src/llm/rate-limit.ts
// Simple sliding-window rate-limit: max N requests/min per (analysisId, IP).
// Uses in-memory counters; adequate for single-instance (your README already mentions single instance).
// Scale-out note: use a shared store (e.g., Redis) for distributed rate limits.

import { NextFunction, Request, Response } from 'express';

type Key = string;
type Counter = { count: number; resetAt: number };

export function makeRateLimiter(maxPerMinute: number) {
    const bucket = new Map<Key, Counter>();

    return function rateLimit(req: Request, res: Response, next: NextFunction) {
        const analysisId = (req.body && req.body.analysisId) || 'unknown';
        const ip = req.ip || req.headers['x-forwarded-for'] || 'local';
        const key = `${analysisId}#${ip}`;

        const now = Date.now();
        const windowMs = 60_000;

        const c = bucket.get(key);
        if (!c || c.resetAt < now) {
            bucket.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (c.count >= maxPerMinute) {
            const retryAfterSec = Math.max(1, Math.ceil((c.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                hint: `Too many requests; try again in ~${retryAfterSec}s.`,
            });
        }

        c.count++;
        return next();
    };
}