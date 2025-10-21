// src/llm/journeys-refiner.service.ts
// Core logic behind POST /llm/journeys/refine.
// - Validates input via schemas
// - Builds a tightly-scoped prompt (no keys leak)
// - Calls provider.complete({ json: true }) with timeout + token clamps
// - Post-processes the LLM result: deterministic IDs for new/merged/updated,
//   enforce source:'llm' for generated or patched items,
//   builds finalJourneys = (journeys - removed - merged.from) U added U merged.to U updated.
// - Returns typed response and logs structured telemetry.

import { env } from '../api/env.js';
import logger from '../logging/logger.js';
import { makeLlmProvider } from './factory.js';
import { RefineJourneysRequestSchema, RefineJourneysResponse, RefineJourneysResponseSchema } from './schemas.js';
import { deterministicJourneyId, journeyStepsSignature, stableStringify } from './utils.js';

// 1) Add this tiny helper near the top (below imports) — used only to enrich the prompt:
function buildNodeIndex(graph: any | null) {
    const out = {
        modules: [] as string[],
        routes: [] as string[],
        components: [] as string[],
        widgets: [] as string[],
        backends: [] as string[],
        virtualRoutes: [] as string[],
        externalRoutes: [] as string[],
    };
    if (!graph?.nodes) return out;
    for (const n of graph.nodes) {
        if (!n?.id || typeof n.id !== 'string') continue;
        switch (n.type) {
            case 'module': out.modules.push(n.id); break;
            case 'route': out.routes.push(n.id); break;
            case 'component': out.components.push(n.id); break;
            case 'widget': out.widgets.push(n.id); break;
            case 'backend': out.backends.push(n.id); break;
            case 'virtual-route': out.virtualRoutes.push(n.id); break;
            case 'external-route': out.externalRoutes.push(n.id); break;
        }
    }
    return out;
}

type SimpleCoverage = {
    allRoutes: Set<string>;
    allBackends: Set<string>;
    routesCovered: Set<string>;
    backendsCovered: Set<string>;
    missingRoutes: string[];
    missingBackends: string[];
    routeCoveragePct: number;
    backendCoveragePct: number;
};

function computeCoverage(graph: any | null, journeys: Array<{ steps: any[] }>): SimpleCoverage {
    const allRoutes = new Set<string>();
    const allBackends = new Set<string>();

    if (graph?.nodes?.length) {
        for (const n of graph.nodes) {
            if (n?.type === 'route' && typeof n.id === 'string') allRoutes.add(n.id);
            if (n?.type === 'backend' && typeof n.id === 'string') allBackends.add(n.id);
        }
    }

    const routesCovered = new Set<string>();
    const backendsCovered = new Set<string>();
    for (const j of journeys) {
        for (const s of j.steps || []) {
            if (s?.stepType === 'route' && typeof s.nodeId === 'string') routesCovered.add(s.nodeId);
            if (s?.stepType === 'backend' && typeof s.nodeId === 'string') backendsCovered.add(s.nodeId);
        }
    }

    const missingRoutes = [...allRoutes].filter(r => !routesCovered.has(r)).sort();
    const missingBackends = [...allBackends].filter(b => !backendsCovered.has(b)).sort();

    const routeCoveragePct = allRoutes.size ? Math.round((routesCovered.size / allRoutes.size) * 100) : 100;
    const backendCoveragePct = allBackends.size ? Math.round((backendsCovered.size / allBackends.size) * 100) : 100;

    return {
        allRoutes, allBackends, routesCovered, backendsCovered,
        missingRoutes, missingBackends, routeCoveragePct, backendCoveragePct,
    };
}

export class JourneysRefinerService {
    async refine(reqBody: any, requestId: string): Promise<RefineJourneysResponse> {
        const startedAt = Date.now();

        // 1) Validate request (throws on error; caught by caller route)
        const input = RefineJourneysRequestSchema.parse(reqBody);
        const { analysisId, journeys, graph, routeMap } = input;

        // 2) Prepare LLM prompt
        const provider = makeLlmProvider();
        if (!provider || !provider.isConfigured()) {
            throw new Error('LLM provider not available/configured');
        }

        // server-side coverage snapshot (input → before)
        const coverage = computeCoverage(graph ?? null, journeys);

        // choose a minimum number of additions: cover at least top-K gaps
        // - At least 3
        // - Also bound by how many gaps we have (routes + backends)
        const missingTotal = coverage.missingRoutes.length + coverage.missingBackends.length;
        const minAdds = Math.max(3, Math.min(10, Math.ceil(missingTotal * 0.4))); // 40% of gaps, 3..10 range

        // ---- Build a node index so the model knows exactly which ids are legal.
        const nodeIndex = buildNodeIndex(graph ?? null);

        // ---- SYSTEM PROMPT (dedupe/merge first, rename intents, no hallucinations, minimal adds)
        const system = [
            'You refine user journeys for a frontend application.',
            'You receive two inputs: (1) a navigation graph and (2) RAW user journeys that are already step-level detailed.',
            '',
            'Objectives (in this order):',
            '1) DEDUPLICATE & MERGE: Find semantic duplicates and merge them. Prefer the shortest, clearest representative. Use merged[{from:[ids], to:journey}].',
            '2) RENAME INTENTS: Give every journey a concise human label derived from its terminal steps (e.g., "Call post.addPost", "Navigate to /users").',
            '3) CORRECT SMALL INCONSISTENCIES: Fix stepType/via/order only if the fix is directly supported by the graph.',
            '4) ADD SPARINGLY: Add journeys only when they are clearly derivable from the graph and improve coverage/quality. Avoid speculative additions.',
            '',
            'Non-negotiable constraints:',
            '- **Use only nodes that exist in the graph** (routes, components, widgets, backends, virtual/external routes). Absolutely no invented ids.',
            '- Journeys must remain detailed (module/route/component/widget/interaction/backend) — do not summarize steps.',
            '- It is allowed (and encouraged) to reduce the total number of journeys by merging/removing duplicates.',
            '- Every journey MUST have a **non-empty** id string (temporary ids allowed, e.g., "temp-...").',
            '- Mark any LLM-touched journeys with source:"llm".',
            '',
            'Output JSON ONLY with EXACT keys:',
            '{ "added": UserJourney[], "removed": string[], "merged": Array<{from:string[], to:UserJourney}>, "updated": UserJourney[], "finalJourneys": UserJourney[] }',
            'Where UserJourney = { id, rootModule, steps[], intent?, success?, source? }.',
        ].join('\n');

        // ---- (Optional) Tiny few-shot that shows MERGE + INTENT RENAME + NO ADD HALLUCINATIONS
        const fewShot = [
            '### EXAMPLE',
            '{',
            '  "input": {',
            '    "graph": { "nodes":[',
            '      {"id":"AppModule","type":"module"},{"id":"/a","type":"route"},{"id":"/b","type":"route"},',
            '      {"id":"comp-a","type":"component"},{"id":"w-a","type":"widget"}], "edges":[], "transitions":[] },',
            '    "journeys": [',
            '      { "id":"J-1","rootModule":"AppModule","steps":[',
            '          {"stepType":"module","nodeId":"AppModule"},',
            '          {"stepType":"route","nodeId":"/a"},',
            '          {"stepType":"component","nodeId":"comp-a"},',
            '          {"stepType":"widget","nodeId":"w-a"}], "source":"analyzer" },',
            '      { "id":"J-dup","rootModule":"AppModule","steps":[',
            '          {"stepType":"module","nodeId":"AppModule"},',
            '          {"stepType":"route","nodeId":"/a"},',
            '          {"stepType":"component","nodeId":"comp-a"},',
            '          {"stepType":"widget","nodeId":"w-a"}], "source":"analyzer" }',
            '    ]',
            '  },',
            '  "goodOutput": {',
            '    "added": [],',
            '    "removed": ["J-dup"],',
            '    "merged": [{ "from":["J-dup"], "to": {',
            '      "id":"J-1","rootModule":"AppModule","steps":[',
            '        {"stepType":"module","nodeId":"AppModule"},',
            '        {"stepType":"route","nodeId":"/a"},',
            '        {"stepType":"component","nodeId":"comp-a"},',
            '        {"stepType":"widget","nodeId":"w-a"}],',
            '      "intent":"Navigate to /a","success":true,"source":"llm"} }],',
            '    "updated": [],',
            '    "finalJourneys": []',
            '  }',
            '}',
            ''
        ].join('\n');

        // ---- USER PROMPT (raw inputs + a compact index of legal node ids)
        const payload = {
            graph: graph ?? null,
            // Raw journeys as-is (per your requirement)
            journeys,
            // Index lists to make “only use graph nodes” unambiguous
            nodeIndex,
            rules: [
                'Merge duplicates and keep only one representative.',
                'Rename intents based on terminal steps.',
                'Only add if directly derivable from the graph; never invent ids.',
                'Every journey id must be non-empty.',
                'finalJourneys must reflect removals/merges/updates.',
            ],
        };

        const prompt = [
            fewShot,
            '### INPUT JSON',
            stableStringify(payload),
            '',
            '### OUTPUT',
            'Return valid JSON with keys: added, removed, merged, updated, finalJourneys. No comments or extra keys.',
        ].join('\n');

        // log approximate payload size for diagnostics
        const promptBytes = Buffer.byteLength(prompt, 'utf8');
        logger.info('[llm.refine] prompt ~%d bytes', promptBytes);

        // 3) LLM call
        logger.info('[llm.refine] req=%s analysisId=%s provider=%s', requestId, analysisId, provider.name);


        const raw = await provider.complete({
            system,
            prompt,
            json: true,
            maxTokens: Math.min(10000, env.llm.openai.maxTokens),
            timeoutMs: env.llm.openai.timeoutMs,
            temperature: 0,
        });

        // 4) Parse + coerce to our response schema (accept LLM JSON; enforce constraints)
        let out: RefineJourneysResponse = {
            added: [],
            removed: [],
            merged: [],
            updated: [],
            finalJourneys: [],
            meta: { provider: provider.name },
        };

        // raw.json may be undefined if the provider returned text; try parsing the text
        const candidate = (raw.json ?? (raw.text ? safeParseJson(raw.text) : null)) || {};
        // Validate/shape via Zod (defaults apply)
        out = RefineJourneysResponseSchema.parse(candidate);

        // 5) Post-process result: make IDs deterministic for LLM-produced journeys
        const stabilize = (j: any): any => {
            // If journey.id is missing/empty OR journey.source === 'llm', build stable ID.
            if (!j.id || String(j.id).trim() === '' || j.source === 'llm') {
                const root = j.rootModule || guessRootFromSteps(j.steps) || 'AppModule';
                const sig = journeyStepsSignature(j.steps || []);
                j.id = deterministicJourneyId(root, sig);
            }
            // Ensure source for LLM-touched journeys
            if (j.source !== 'analyzer') {
                j.source = 'llm';
            }
            return j;
        };

        out.added = (out.added || []).map(stabilize);
        out.updated = (out.updated || []).map(stabilize);
        out.merged = (out.merged || []).map(m => ({ from: m.from, to: stabilize(m.to) }));

        // Build finalJourneys if missing: (original - removed - merged.from) U added U merged.to U updated
        if (!out.finalJourneys || out.finalJourneys.length === 0) {
            const removed = new Set(out.removed || []);
            const mergedFrom = new Set<string>((out.merged || []).flatMap(m => m.from));
            const keep = journeys.filter(j => !removed.has(j.id) && !mergedFrom.has(j.id));
            out.finalJourneys = [
                ...keep,
                ...out.added,
                ...out.updated,
                ...(out.merged || []).map(m => m.to),
            ];
        } else {
            // Ensure stabilization on finalJourneys as well
            out.finalJourneys = out.finalJourneys.map(stabilize);
        }

        // 6) Meta
        out.meta = {
            ...(out.meta || {}),
            requestId,
            provider: provider.name,
            tookMs: Date.now() - startedAt,
        };

        // Lightweight guard to avoid silent no-ops
        const originalCount = journeys.length;
        const delta = (out.added?.length ?? 0) + (out.updated?.length ?? 0) + (out.merged?.length ?? 0);
        if (delta === 0 && (out.finalJourneys?.length ?? 0) <= originalCount) {
            // One-shot nudge retry (same prompt + a single extra line)
            const retry = await provider.complete({
                system,
                prompt: prompt + '\nIMPORTANT: Current proposal does not improve coverage. Add at least 3 targeted journeys to cover missing transitions/routes.',
                json: true,
                maxTokens: Math.min(10000, env.llm.openai.maxTokens),
                timeoutMs: env.llm.openai.timeoutMs,
                temperature: 0.45,
            });
            const candidate = (retry.json ?? (retry.text ? safeParseJson(retry.text) : null)) || {};
            const retriedOut = RefineJourneysResponseSchema.parse(candidate);
            // If the retry improved, use it
            if ((retriedOut.added?.length ?? 0) > 0 || (retriedOut.updated?.length ?? 0) > 0 || (retriedOut.merged?.length ?? 0) > 0) {
                out = retriedOut;
            }
        }

        return out;
    }
}

function safeParseJson(s: string) {
    try { return JSON.parse(s); } catch { return undefined; }
}

function guessRootFromSteps(steps: Array<{ stepType: string; nodeId: string }>): string | null {
    // Use the first 'module' step if present; otherwise null.
    const m = steps?.find(s => s.stepType === 'module');
    return m?.nodeId ?? null;
}