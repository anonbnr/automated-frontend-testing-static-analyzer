// src/api/routes/llm.ts
// LLM router:
// - GET /llm/health -- gated
// - POST /llm/journeys/refine
//
// Features per spec:
//   * zod validation
//   * rate-limit per analysisId/IP (uses env.llm.openai.rateLimitPerMin)
//   * idempotency via "Idempotency-Key" header
//   * 5–15 min cache (default 10m), with `X-From-Cache` header when hit
//   * deterministic IDs for new/merged/updated journeys
//   * consistent error envelope { success:false, error, hint? }
//   * logs with a requestId for correlation

import { Router } from 'express';
import TtlCache from '../../llm/cache.js';
import { makeLlmProvider } from '../../llm/factory.js';
import { llmGate } from '../../llm/gate.js';
import { JourneysRefinerService } from '../../llm/journeys-refiner.service.js';
import { makeRateLimiter } from '../../llm/rate-limit.js';
import { RefineJourneysRequestSchema } from '../../llm/schemas.js';
import { sha1Hex, stableStringify } from '../../llm/utils.js';
import logger from '../../logging/logger.js';
import { env } from '../env.js';

/**
 * /llm/* router — currently a guarded stub.
 * If disabled/misconfigured, returns 503 + hint (via llmGate).
 * Concrete endpoints will be added later here.
 */
const router = Router();

// Apply capability/misconfig gate to all LLM routes
router.use(llmGate);

// Simple health endpoint so FE can ping a live provider during development.
router.get('/health', async (_req, res) => {
    const provider = makeLlmProvider();
    logger.info('[GET llm/] health check — provider=%s', provider?.name ?? 'none');
    return res.json({
        success: true,
        provider: provider?.name ?? null,
        enabled: env.llm.enabled ?? false,
        model: env.llm.openai.model ?? null
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// /llm/journeys/refine
// ──────────────────────────────────────────────────────────────────────────────
const limiter = makeRateLimiter(Math.max(1, env.llm.openai.rateLimitPerMin));
const cache = new TtlCache<any>(env.llm.journeysCacheTtlSec * 1000);
const service = new JourneysRefinerService();

router.post('/journeys/refine', limiter, async (req, res) => {
    const startedAt = Date.now();
    const requestId = `R-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

    try {
        // 1) Validate body early to form a cache key
        const parsed = RefineJourneysRequestSchema.parse(req.body);

        // 2) Idempotency & cache
        const idem = (req.header('Idempotency-Key') || '').trim();
        const provider = makeLlmProvider();
        const providerKey = provider ? `${provider.name}` : 'none';

        const cacheKey = [
            'journeys/refine',
            providerKey,
            idem || sha1Hex(stableStringify(parsed)), // hash body when no idempotency key
        ].join('#');

        const cached = cache.get(cacheKey);
        if (cached) {
            res.setHeader('X-From-Cache', 'true');
            logger.info('[%s] /llm/journeys/refine cache-hit key=%s', requestId, cacheKey);
            return res.json({
                ...cached,
                meta: { ...(cached.meta || {}), fromCache: true, requestId },
            });
        }

        // 3) Size clamp (defensive; body parser likely already enforced a limit)
        const approxBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8');
        const clampBytes = 1_000_000; // ~1MB; adjust if needed
        if (approxBytes > clampBytes) {
            return res.status(413).json({
                success: false,
                error: 'PAYLOAD_TOO_LARGE',
                hint: `Payload ~${approxBytes} bytes exceeds limit ${clampBytes}. Reduce graph/journeys size.`,
            });
        }

        // 4) Run refinement
        logger.info('[%s] /llm/journeys/refine analysisId=%s', requestId, parsed.analysisId);
        const result = await service.refine(parsed, requestId);

        // 5) Cache result
        cache.set(cacheKey, result);
        res.setHeader('X-From-Cache', 'false');

        return res.json(result);
    } catch (err: any) {
        // Distinguish validation vs LLM/provider errors
        const isZod = !!(err?.issues && err?.name === 'ZodError');
        if (isZod) {
            logger.warn('[%s] refine validation error: %s', requestId, err.message);
            return res.status(400).json({
                success: false,
                error: 'INVALID_REQUEST',
                hint: err.issues?.map((i: any) => i.message).join('; ') || 'Invalid input.',
            });
        }

        const msg = String(err?.message || err);
        const timedOut =
            err?.name === 'AbortError' ||
            /aborted|AbortError|timeout/i.test(msg);

        if (timedOut) {
            logger.error('[%s] refine timeout after %dms', requestId, env.llm.openai.timeoutMs);
            res.setHeader('X-Timeout-Ms', String(env.llm.openai.timeoutMs));
            return res.status(504).json({
                success: false,
                error: 'LLM_TIMEOUT',
                hint: `The LLM call exceeded the ${env.llm.openai.timeoutMs}ms limit. Increase LLM_TIMEOUT_MS or shrink the input.`,
            });
        }

        logger.error('[%s] refine error: %s', requestId, msg);
        // Provider/LLM failures → 502
        return res.status(502).json({
            success: false,
            error: 'LLM_CALL_FAILED',
            hint: msg,
        });
    } finally {
        const took = Date.now() - startedAt;
        logger.info('[%s] /llm/journeys/refine done in %dms', requestId, took);
    }
});

export default router;