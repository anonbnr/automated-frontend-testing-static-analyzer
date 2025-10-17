// src/api/routes/capabilities.ts
import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeLlmProvider } from '../../llm/factory.js';
import logger from '../../logging/logger.js';
import { BACKEND_ROOT, env, getLlmMisconfigHint } from '../env.js';

/**
 * GET /capabilities
 * Reports platform capabilities and LLM availability for the frontend.
 * AC: includes "llm" in engines when LLM is enabled AND configured.
 */
const router = Router();

router.get('/', (_req, res) => {
    // Backend details
    const backend = {
        version: readBackendVersion(),
        node: `${process.versions.node}+`,
        apiJsonLimit: env.API_JSON_LIMIT,
    };

    // LLM availability
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

    // Features (add "llm" only when enabled & configured)
    const features = ['analysis', 'graph', 'user-journeys', 'screenshots'];
    if (llmEnabled) features.push('llm');

    logger.info('[/capabilities] %j', { backend, features, llm });

    return res.json({
        success: true,
        backend,
        features,
        llm,
    });
});

function readBackendVersion(): string {
    try {
        const pkgPath = resolve(BACKEND_ROOT, 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

export default router;