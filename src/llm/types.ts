// ──────────────────────────────────────────────────────────────────────────────
// llm/types.ts
//
//  Public, provider-agnostic types for the LLM module.
//  Keep this surface stable so higher layers remain decoupled from vendors.
// ──────────────────────────────────────────────────────────────────────────────


/** Add new providers here as you extend the system. */
export type LlmName = 'openai';


/**
 * Minimal provider contract the rest of the app depends on.
 * Implementations may internally use "chat" or "responses" APIs;
 * the contract only exposes a single `complete` primitive.
 */
export interface LlmProvider {
    /** Provider identifier (e.g., 'openai'). */
    name: LlmName;

    /** True when the provider has enough config to run (e.g., API key present). */
    isConfigured(): boolean;

    /**
    * Minimal completion primitive used by feature endpoints.
    * Implementations can map to chat or responses APIs under the hood.
    *
    * @param opts.system     Optional system prompt / instructions
    * @param opts.prompt     The user prompt
    * @param opts.json       When true, ask the model for valid JSON and try to parse it
    * @param opts.maxTokens  Optional per-call override (falls back to provider default)
    * @param opts.temperature Sampling temperature
    * @param opts.timeoutMs  Abort the request after this many ms (provider default otherwise)
    *
    * @returns `{ text?: string; json?: unknown }`
    *          - `text`   raw assistant content
    *          - `json`   parsed JSON (when `json: true` and parse succeeds)
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