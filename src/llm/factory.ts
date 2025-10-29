// ──────────────────────────────────────────────────────────────────────────────
// llm/factory.ts
//
//  Build the concrete LLM provider from environment configuration.
//  Returns `null` when LLM is disabled so callers can feature-gate cleanly.
// ──────────────────────────────────────────────────────────────────────────────

import { env } from "../api/env.js";
import logger from "../logging/logger.js";
import { OpenAIProvider } from "./providers/openai.provider.js";
import { LlmProvider } from "./types.js";

/**
 * Instantiate the configured provider or return null when disabled.
 * Logs a short summary for observability.
 */
export function makeLlmProvider(): LlmProvider | null {
    if (!env.llm.enabled) {
        logger.info("[LLMFactory] disabled via configuration");
        return null;
    }

    switch (env.llm.provider) {
        case 'openai':
            logger.info(
                "[LLMFactory] provider=openai model=%s baseUrl=%s",
                env.llm.openai.model,
                env.llm.openai.baseUrl ?? "default"
            );
            return new OpenAIProvider(env.llm.openai);
        default:
            logger.warn("[LLMFactory] unknown provider '%s' — LLM disabled", String(env.llm.provider));
            return null;
    }
}