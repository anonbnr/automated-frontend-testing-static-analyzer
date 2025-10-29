// ──────────────────────────────────────────────────────────────────────────────
// api/routes/capabilities.ts
//
//  GET /capabilities
//  -----------------
//  Purpose:
//    Report backend/environment capabilities, including whether
//    the LLM engine is both *enabled* and *properly configured*.
//
//  Response (200):
//  {
//    "success": true,
//    "backend": {
//      "version": "1.2.3",         // read from package.json (fallback "0.0.0")
//      "node": "18.19.0+",
//      "apiJsonLimit": "1mb"       // from env.API_JSON_LIMIT
//    },
//    "features": ["analysis","graph","user-journeys","screenshots","llm?"],
//    "llm": {
//      "enabled": true|false,       // true only if enabled AND configured
//      "provider": "openai" | null,
//      "model": "gpt-4o-mini" | null,
//      "maxTokens": number | null,
//      "rateLimitPerMin": number | null,
//      "cacheTtlSec": number | null
//    }
//  }
// ──────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { makeLlmProvider } from '../../llm/factory.js';
import logger from '../../logging/logger.js';
import { env, getLlmMisconfigHint } from '../env.js';
import { readBackendVersion, rid } from '../utils.js';

/**
 * GET /capabilities
 * Reports platform capabilities and LLM availability for the frontend.
 * AC: includes "llm" in engines when LLM is enabled AND configured.
 */
const router = Router();

/**
 * GET /capabilities
 * Reports platform capabilities and LLM availability.
 * AC: includes "llm" in features only when the LLM is enabled AND configured.
 */
router.get('/', (_req, res) => {
    const requestId = rid();

    // Backend details (always available)
    const backend = {
        version: readBackendVersion(),
        node: `${process.versions.node}+`,
        apiJsonLimit: env.API_JSON_LIMIT,
    };

    // LLM availability (enabled + properly configured)
    const hint = getLlmMisconfigHint();
    const provider = makeLlmProvider();
    const llmEnabled = !hint && !!provider?.isConfigured();
    const llm = {
        enabled: llmEnabled,
        provider: env.llm.provider ?? null,
        model: env.llm.openai.model ?? null,
        maxTokens: env.llm.openai.maxTokens ?? null,
        rateLimitPerMin: env.llm.openai.rateLimitPerMin ?? null,
        cacheTtlSec: env.llm.journeysCacheTtlSec ?? null,
    }

    // Static capabilities + LLM feature gate
    const features = ['analysis', 'graph', 'user-journeys', 'screenshots'];
    if (llmEnabled) features.push('llm');

    // Observability header
    res.setHeader('X-Request-Id', requestId);

    logger.info('[/capabilities] %j', { backend, features, llm });

    return res.json({
        success: true,
        backend,
        features,
        llm,
    });
});

export default router;