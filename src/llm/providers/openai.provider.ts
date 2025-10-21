// src/llm/providers/openai.provider.ts
import { LlmProvider } from "../types.js";

type OpenAIConfig = {
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs: number;
    maxTokens: number;
};

function tryParseJson(s: string) {
    try {
        return JSON.parse(s);
    }
    catch {
        return undefined;
    }
}

export class OpenAIProvider implements LlmProvider {
    name = 'openai' as const;

    constructor(private cfg: OpenAIConfig) { }

    isConfigured(): boolean {
        return !!this.cfg.apiKey;
    }

    /**
     * Minimal wrapper to call OpenAI chat completions.
     * NOTE: We intentionally keep this low-level; higher layers will shape prompts.
     */
    async complete(opts: {
        system?: string;
        prompt: string;
        json?: boolean;
        maxTokens?: number;
        temperature?: number;
        timeoutMs?: number;
    }): Promise<{ text?: string; json?: unknown }> {
        const body = {
            model: this.cfg.model,
            messages: [
                ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
                { role: 'user', content: opts.prompt },
            ],
            ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
            max_tokens: opts.maxTokens ?? this.cfg.maxTokens,
            temperature: opts.temperature ?? 0,
            top_p: 1.0,
            seed: 123456
        };

        const endpoint = (this.cfg.baseUrl || 'https://api.openai.com/v1') + '/chat/completions';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? this.cfg.timeoutMs);

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.cfg.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
            }

            const data: any = await res.json();
            const text: string = data?.choices?.[0]?.message?.content ?? '';
            return { text, json: opts.json ? tryParseJson(text) : undefined };
        }
        catch (e: any) {
            if (e?.name === 'AbortError') {
                // Make it easy for the route to classify this as a timeout
                const err = new Error('LLM request aborted (timeout)');
                (err as any).name = 'AbortError';
                throw err;
            }
            throw e;
        }
        finally {
                clearTimeout(timer);
            }
        }
    }