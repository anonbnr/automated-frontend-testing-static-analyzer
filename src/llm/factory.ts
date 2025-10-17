// llm/factory.ts

import { env } from "../api/env.js";
import { OpenAIProvider } from "./providers/openai.provider.js";
import { LlmProvider } from "./types.js";

/**
 * Builds the concrete provider based on env.llm.* configuration.
 * Returns null when LLM is disabled (so callers can feature-gate).
 */
export function makeLlmProvider(): LlmProvider | null {
    if (!env.llm.enabled) return null;
    switch (env.llm.provider) {
        case 'openai':
            return new OpenAIProvider(env.llm.openai);
        default:
            return null;
    }
}