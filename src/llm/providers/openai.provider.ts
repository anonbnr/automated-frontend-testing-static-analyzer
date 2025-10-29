// ──────────────────────────────────────────────────────────────────────────────
// llm/providers/openai.provider.ts
//
//  OpenAI provider implementation of the generic LlmProvider interface.
//  Thin wrapper around the Chat Completions endpoint, with optional JSON mode,
//  timeout/abort support, and careful logging without leaking secrets.
// ──────────────────────────────────────────────────────────────────────────────

import logger from "../../logging/logger.js";
import { LlmProvider } from "../types.js";

type OpenAIConfig = {
    apiKey: string;
    model: string;
    baseUrl?: string; // default: https://api.openai.com/v1
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
    * Minimal wrapper to call OpenAI Chat Completions.
    * NOTE: This is intentionally low-level; higher layers shape prompts.
    */
    async complete(opts: {
        system?: string;
        prompt: string;
        json?: boolean;
        maxTokens?: number;
        temperature?: number;
        timeoutMs?: number;
    }): Promise<{ text?: string; json?: unknown }> {
        if (!this.isConfigured()) {
            const err = new Error("OpenAI provider is not configured (missing apiKey/model)");
            (err as any).code = "LLM_MISCONFIGURED";
            throw err;
        }

        const endpoint = (this.cfg.baseUrl || 'https://api.openai.com/v1') + '/chat/completions';
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

        const timeout = opts.timeoutMs ?? this.cfg.timeoutMs;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);

        logger.debug(
            "[OpenAIProvider] POST %s model=%s json=%s maxTokens=%s temp=%s timeoutMs=%s",
            endpoint.replace(/https?:\/\//, ''), // avoid noisy scheme
            this.cfg.model,
            !!opts.json,
            body.max_tokens,
            body.temperature,
            timeout
        );

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.cfg.apiKey}`,
                    'User-Agent': 'SoftScanner-LLM/1.0',
                },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                logger.warn("[OpenAIProvider] HTTP %d — %s", res.status, text || res.statusText);
                throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
            }

            const data: any = await res.json();
            const text: string = data?.choices?.[0]?.message?.content ?? '';

            // Log payload size rather than content
            logger.log(
                "trace",
                "[OpenAIProvider] received %d chars (finish_reason=%s)",
                text.length,
                data?.choices?.[0]?.finish_reason ?? "?"
            );

            return { text, json: opts.json ? tryParseJson(text) : undefined };
        }
        catch (e: any) {
            if (e?.name === 'AbortError') {
                const err = new Error('LLM request aborted (timeout)');
                (err as any).name = 'AbortError';
                logger.warn("[OpenAIProvider] AbortError after %d ms", timeout);
                throw err;
            }
            logger.error("[OpenAI] request failed: %o", e);
            throw e;
        }
        finally {
            clearTimeout(timer);
        }
    }
}