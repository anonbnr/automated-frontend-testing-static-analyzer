// ──────────────────────────────────────────────────────────────────────────────
// api/routes/llm.ts
//
//  LLM Router
//  ----------
//  Endpoints:
//   • GET  /llm/health           — quick provider health (guarded by llmGate)
//   • POST /llm/journeys/refine  — journeys refinement (validation, rate-limit,
//                                  idempotency, TTL cache, stable IDs)
//
//  Cross-cutting features:
//   • llmGate: returns 503 + hint when disabled/misconfigured.
//   • zod validation for request payloads.
//   • Per-minute sliding-window rate-limit (analysisId + IP).
//   • Idempotency via "Idempotency-Key" header (string). Body-hash fallback.
//   • TTL cache (default ~10 min). X-From-Cache header on hits.
//   • Consistent error envelopes: { success:false, error, hint? }.
//   • Structured logs with a requestId (X-Request-Id header).
//
//  Health (200):
//   { success:true, provider:"openai"|null, enabled:boolean, model:string|null }
//
//  Refine (200):
//   RefineJourneysResponse (see llm/schemas.ts).
//
//  Error codes:
//   400 INVALID_REQUEST     — schema validation failed
//   413 PAYLOAD_TOO_LARGE   — basic clamp (defensive; parser likely enforces too)
//   429 RATE_LIMIT_EXCEEDED — rate limit (Retry-After + X-RateLimit-* headers)
//   502 LLM_CALL_FAILED     — provider call failed
//   503 LLM_UNAVAILABLE     — llmGate blocks (misconfig/disabled)
//   504 LLM_TIMEOUT         — provider aborted/timeout
//
//  Headers:
//   - Cache-Control: no-store
//   - X-Request-Id: request id
//   - X-From-Cache: "true"/"false" on refine
//   - X-Timeout-Ms: present on 504 with the configured timeout value
//   - X-RateLimit-*: on 429 and (best-effort) successes
// ──────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import TtlCache from '../../llm/cache.js';
import { makeLlmProvider } from '../../llm/factory.js';
import { llmGate } from '../../llm/gate.js';
import { makeRateLimiter } from '../../llm/rate-limit.js';
import { RefineJourneysRequestSchema } from '../../llm/schemas.js';
import { JourneysRefinerService } from '../../llm/services/journeys-refiner.service.js';
import { sha1Hex, stableStringify } from '../../llm/utils.js';
import logger from '../../logging/logger.js';
import { env } from '../env.js';
import { rid } from '../utils.js';

/**
 * /llm/* router — currently a guarded stub.
 * If disabled/misconfigured, returns 503 + hint (via llmGate).
 * Concrete endpoints will be added later here.
 */
const router = Router();

// Apply capability/misconfig gate to all LLM routes
router.use(llmGate);

// ──────────────────────────────────────────────────────────────────────────────
// GET /llm/health
// Notes:
//  • Guarded by llmGate (503 w/ hint if disabled/misconfigured).
//  • Useful for downstream users to quickly ping provider presence/config.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/health', async (_req, res) => {
    const requestId = rid();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Request-Id', requestId);

    const provider = makeLlmProvider();
    logger.info('[%s] [GET /llm/health] provider=%s enabled=%s model=%s',
        requestId, provider?.name ?? 'none', String(env.llm.enabled ?? false), env.llm.openai.model ?? 'null');

    return res.json({
        success: true,
        provider: provider?.name ?? null,
        enabled: env.llm.enabled ?? false,
        model: env.llm.openai.model ?? null
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /llm/journeys/refine
//  • Validates input (Zod).
//  • Rate-limits (analysisId + IP).
//  • Idempotency (Idempotency-Key) + body-hash fallback.
//  • TTL cache (env.llm.journeysCacheTtlSec).
//  • Delegates to JourneysRefinerService; returns its typed result.
// ──────────────────────────────────────────────────────────────────────────────
const limiter = makeRateLimiter(Math.max(1, env.llm.openai.rateLimitPerMin));
const cache = new TtlCache<any>(env.llm.journeysCacheTtlSec * 1000);
const service = new JourneysRefinerService();

router.post('/journeys/refine', limiter, async (req, res) => {
    const requestId = rid();
    const startedAt = Date.now();

    // Observability headers
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Request-Id', requestId);

    try {
        // 1) Validate body early to form a stable cache key
        const parsed = RefineJourneysRequestSchema.parse(req.body);

        // 2) Idempotency key + provider-dependent cache key
        const idem = (req.header('Idempotency-Key') || '').trim();
        const provider = makeLlmProvider();
        const providerKey = provider ? `${provider.name}` : 'none';

        const cacheKey = [
            'journeys/refine',
            providerKey,
            idem || sha1Hex(stableStringify(parsed)), // hash body when no idempotency key provided
        ].join('#');

        // 3) TTL cache lookup
        const cached = cache.get(cacheKey);
        if (cached) {
            res.setHeader('X-From-Cache', 'true');
            logger.info('[%s] [/llm/journeys/refine] cache-hit key=%s', requestId, cacheKey);
            return res.json({
                ...cached,
                meta: { ...(cached.meta || {}), fromCache: true, requestId },
            });
        }

        // 4) Defensive size clamp
        const approxBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8');
        const clampBytes = 1_000_000; // ~1MB; adjust if needed
        if (approxBytes > clampBytes) {
            logger.warn('[%s] [/llm/journeys/refine] refine payload too large ~%dB (limit=%d)', requestId, approxBytes, clampBytes);
            return res.status(413).json({
                success: false,
                error: 'PAYLOAD_TOO_LARGE',
                hint: `Payload ~${approxBytes} bytes exceeds limit ${clampBytes}. Reduce graph/journeys size.`,
            });
        }

        // 5) Execute refinement
        logger.info('[%s] [/llm/journeys/refine] refine start analysisId=%s payload~%dB', requestId, parsed.analysisId, approxBytes);
        const result = await service.refine(parsed, requestId);

        // 6) Store in cache and return
        cache.set(cacheKey, result);
        res.setHeader('X-From-Cache', 'false');

        logger.info('[%s] [/llm/journeys/refine] refine ok journeys(final)=%d Δ+=%d Δupd=%d Δmerged=%d Δrm=%d',
            requestId,
            result.finalJourneys?.length ?? 0,
            result.added?.length ?? 0,
            result.updated?.length ?? 0,
            result.merged?.length ?? 0,
            result.removed?.length ?? 0
        );

        return res.json(result);
    } catch (err: any) {
        // Distinguish validation vs. provider/timeout errors
        const msg = String(err?.message || err);
        const isZod = !!(err?.issues && err?.name === 'ZodError');
        if (isZod) {
            // Zod validation failures → 400
            logger.warn('[%s] [/llm/journeys/refine] refine validation error: %s', requestId, msg);
            return res.status(400).json({
                success: false,
                error: 'INVALID_REQUEST',
                hint: err.issues?.map((i: any) => i.message).join('; ') || 'Invalid input.',
            });
        }

        const timedOut = err?.name === 'AbortError' || /aborted|AbortError|timeout/i.test(msg);
        if (timedOut) {
            // Abort timeout failure → 504
            logger.error('[%s] [/llm/journeys/refine] refine timeout after %dms', requestId, env.llm.openai.timeoutMs);
            res.setHeader('X-Timeout-Ms', String(env.llm.openai.timeoutMs));
            return res.status(504).json({
                success: false,
                error: 'LLM_TIMEOUT',
                hint: `The LLM call exceeded the ${env.llm.openai.timeoutMs}ms limit. Increase LLM_TIMEOUT_MS or shrink the input.`,
            });
        }

        // Provider/LLM failures → 502
        logger.error('[%s] [/llm/journeys/refine] refine error: %s', requestId, msg);
        return res.status(502).json({
            success: false,
            error: 'LLM_CALL_FAILED',
            hint: msg,
        });
    } finally {
        const took = Date.now() - startedAt;
        logger.info('[%s] [/llm/journeys/refine] refine done in %dms', requestId, took);
    }
});

export default router;