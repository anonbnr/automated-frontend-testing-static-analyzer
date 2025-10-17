// llm/types.ts
/**
 * Public, provider-agnostic types for the LLM module.
 * Keep this surface stable so higher layers aren't coupled to vendors.
 */
export type LlmName = 'openai'; // extend here for more providers

export interface LlmProvider {
    /** Provider identifier (e.g., 'openai'). */
    name: LlmName;

    /** True when the provider has enough config to run (e.g., API key present). */
    isConfigured(): boolean;

    /**
     * Minimal completion primitive used by feature endpoints.
     * Implementations can map to chat or responses APIs under the hood.
     */
    complete(opts: {
        system?: string;
        prompt: string;
        json?: boolean;
        maxTokens?: number;
        temperature?: number;
        timeoutMs?: number;
    }): Promise<{ text?: string; json?: unknown }>;
}