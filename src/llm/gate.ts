// src/llm/gate.ts
import { NextFunction, Request, Response } from 'express';
import { getLlmMisconfigHint } from '../api/env.js';
import logger from '../logging/logger.js';

/**
 * Middleware that blocks LLM endpoints when disabled/misconfigured.
 * Returns 503 with a helpful "hint" string (Acceptance Criteria).
 */
export function llmGate(req: Request, res: Response, next: NextFunction) {
    const hint = getLlmMisconfigHint();
    if (hint) {
        logger.warn('[llm-gate] 503 %s %s — %s', req.method, req.originalUrl, hint);
        return res.status(503).json({
            success: false,
            error: { code: 'LLM_UNAVAILABLE', hint },
        });
    }
    return next();
}