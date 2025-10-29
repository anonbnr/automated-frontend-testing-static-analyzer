// ──────────────────────────────────────────────────────────────────────────────
// llm/services/journeys-refiner.service.ts
//
//  JourneysRefinerService
//  ----------------------
//  Core logic behind POST /llm/journeys/refine.
//  Responsibilities:
//   • Validate request (Zod) — strict on requireds, forward-compatible on meta.
//   • Build a compact prompt with an explicit index of legal node IDs.
//   • Call provider.complete({ json:true }) with time/token clamps from env.
//   • Normalize/stabilize LLM output:
//       - deterministic IDs for any LLM-touched items,
//       - enforce source:"llm" on LLM-touched items,
//       - compute finalJourneys.
//   • Gentle one-shot retry if the proposal is effectively a no-op.
//   • Structured logging throughout (start/size/retry/end).
//
//  Design notes:
//   • No state kept on the instance; method is referentially transparent
//     given (reqBody, requestId, env, provider).
//   • Provider-agnostic: only expects `.complete({ ... })` and `.name`.
// ──────────────────────────────────────────────────────────────────────────────

import { env } from '../../api/env.js';
import logger from '../../logging/logger.js';
import { makeLlmProvider } from '../factory.js';
import { RefineJourneysRequestSchema, RefineJourneysResponse, RefineJourneysResponseSchema } from '../schemas.js';
import { deterministicJourneyId, journeyStepsSignature, stableStringify } from '../utils.js';

// ──────────────────────────────────────────────────────────────────────────────
// Lightweight local types
// ──────────────────────────────────────────────────────────────────────────────
type StepLike = { stepType: string; nodeId: string; via?: string; metadata?: any };
type JourneyLike = { id?: string; rootModule?: string; source?: string; steps?: StepLike[] };

// Coverage snapshot shape used for diagnostics.
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

/** Try parse JSON; return undefined on failure (never throws). */
function safeParseJson(s: string) {
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}

/** Use the first 'module' step if present; otherwise null. */
function guessRootFromSteps(steps: Array<{ stepType: string; nodeId: string }> | undefined | null): string | null {
    if (!steps?.length) return null;
    const m = steps.find(s => s.stepType === 'module');
    return m?.nodeId ?? null;
}

/** Build a node index (IDs grouped by kind) to make “legal nodes only” unambiguous. */
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

/** Compute simple coverage diagnostics from (graph, journeys). */
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

/** Construct the **system** prompt (policy + constraints). */
function buildSystemPrompt(): string {
    return [
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
        '- Use only nodes that exist in the graph (routes/components/widgets/backends/virtual/external routes). Absolutely no invented ids.',
        '- Journeys must remain detailed (module/route/component/widget/interaction/backend) — do not summarize steps.',
        '- It is allowed (and encouraged) to reduce the total number of journeys by merging/removing duplicates.',
        '- Every journey MUST have a non-empty id string (temporary ids allowed, e.g., "temp-...").',
        '- Mark any LLM-touched journeys with source:"llm".',
        '',
        'Output JSON ONLY with EXACT keys:',
        '{ "added": UserJourney[], "removed": string[], "merged": Array<{from:string[], to:UserJourney}>, "updated": UserJourney[], "finalJourneys": UserJourney[] }',
        'Where UserJourney = { id, rootModule, steps[], intent?, success?, source? }.'
    ].join('\n');
}

/** A tiny few-shot that showcases merge + intent-rename + no hallucinations. */
function buildFewShot(): string {
    return [
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
}

/** Assemble the user prompt payload. */
function buildUserPayload(params: {
    graph: any | null;
    routeMap: any | null;
    journeys: any[];
    nodeIndex: ReturnType<typeof buildNodeIndex>;
}) {
    const { graph, routeMap, journeys, nodeIndex } = params;

    return stableStringify({
        graph,            // may be null (schema allows either graph or routeMap)
        routeMap,         // may be null
        journeys,         // raw journeys as-is
        nodeIndex,        // index lists of legal node ids
        rules: [
            'Merge duplicates and keep only one representative.',
            'Rename intents based on terminal steps.',
            'Only add if directly derivable from the graph; never invent ids.',
            'Every journey id must be non-empty.',
            'finalJourneys must reflect removals/merges/updates.',
        ],
    });
}

/** Join few-shot + INPUT + OUTPUT directive into the final prompt. */
function buildFullPrompt(fewShot: string, inputJson: string): string {
    return [
        fewShot,
        '### INPUT JSON',
        inputJson,
        '',
        '### OUTPUT',
        'Return valid JSON with keys: added, removed, merged, updated, finalJourneys. No comments or extra keys.',
    ].join('\n');
}

/** Stabilize an LLM-touched journey: deterministic ID + enforce source:"llm". */
function stabilizeJourney<T extends JourneyLike>(j: T): T {
    const needsStableId = !j.id || String(j.id).trim() === '' || j.source === 'llm';
    if (needsStableId) {
        const root = j.rootModule || guessRootFromSteps(j.steps) || 'AppModule';
        const sig = journeyStepsSignature(j.steps || []);
        (j as any).id = deterministicJourneyId(root, sig);
    }
    if ((j as any).source !== 'analyzer') (j as any).source = 'llm';
    return j;
}

/** Build `finalJourneys` */
function assembleFinalJourneys(params: {
    original: any[];
    added: any[];
    updated: any[];
    merged: Array<{ from: string[]; to: any }>;
    removed: string[];
}): any[] {
    const { original, added, updated, merged, removed } = params;
    const removedSet = new Set(removed || []);
    const mergedFrom = new Set<string>((merged || []).flatMap(m => m.from));
    const keep = (original || []).filter(j => !removedSet.has(j.id) && !mergedFrom.has(j.id));
    return [...keep, ...(added || []), ...(updated || []), ...(merged || []).map(m => m.to)];
}

/** Decide if a gentle retry is warranted. */
function shouldNudgeRetry(out: RefineJourneysResponse, originalCount: number): boolean {
    const changed =
        (out.added?.length ?? 0) +
        (out.updated?.length ?? 0) +
        (out.merged?.length ?? 0) +
        (out.removed?.length ?? 0);

    return changed === 0 && (out.finalJourneys?.length ?? 0) <= originalCount;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────-

export class JourneysRefinerService {
    /**
    * Refine/merge/add journeys with an LLM while enforcing strong invariants.
    * @param reqBody   Raw request body (validated internally).
    * @param requestId Correlation ID for logs/metrics.
    */
    async refine(reqBody: any, requestId: string): Promise<RefineJourneysResponse> {
        const startedAt = Date.now();

        // 1) Validate request (throws on error; caught by caller route)
        const input = RefineJourneysRequestSchema.parse(reqBody);
        const { analysisId, journeys, graph, routeMap } = input;

        // 2) Provider selection + availability check
        const provider = makeLlmProvider();
        if (!provider || !provider.isConfigured()) {
            const err = new Error('LLM provider not available/configured');
            (err as any).code = 'LLM_UNAVAILABLE';
            throw err;
        }

        // 3) Diagnostics (pre)
        const coverage = computeCoverage(graph ?? null, journeys);

        logger.info(
            '[JourneysRefinerService] start req=%s analysis=%s provider=%s J=%d routes=%d(%d%%) backends=%d(%d%%)',
            requestId,
            analysisId,
            provider.name,
            journeys.length,
            coverage.routesCovered.size,
            coverage.routeCoveragePct,
            coverage.backendsCovered.size,
            coverage.backendCoveragePct
        );

        // 4) Prompt assembly (no secrets; explicit legal node index).
        const system = buildSystemPrompt();
        const fewShot = buildFewShot();
        const nodeIndex = buildNodeIndex(graph ?? null);
        const userPayload = buildUserPayload({ graph: graph ?? null, routeMap: routeMap ?? null, journeys, nodeIndex });
        const prompt = buildFullPrompt(fewShot, userPayload);

        // log approximate payload size for diagnostics
        const promptBytes = Buffer.byteLength(prompt, 'utf8');
        logger.info('[JourneysRefinerService] prompt ~%d bytes', promptBytes);

        // 5) LLM call (token/time clamps from env).
        const maxTokens = Math.min(10_000, env.llm.openai.maxTokens);
        const timeoutMs = env.llm.openai.timeoutMs;

        logger.info('[JourneysRefinerService] req=%s analysisId=%s provider=%s', requestId, analysisId, provider.name);
        const raw = await provider.complete({
            system,
            prompt,
            json: true,
            maxTokens,
            timeoutMs,
            temperature: 0, // deterministic as much as feasible
        });

        // 6) Parse + validate model output.
        let out: RefineJourneysResponse = {
            added: [],
            removed: [],
            merged: [],
            updated: [],
            finalJourneys: [],
            meta: { provider: provider.name },
        };

        // Provider may return text; prefer raw.json, otherwise parse text.
        const candidate = (raw.json ?? (raw.text ? safeParseJson(raw.text) : null)) || {};
        out = RefineJourneysResponseSchema.parse(candidate);

        // 7) Stabilize & enforce provenance for all LLM-touched items.
        out.added = (out.added || []).map(stabilizeJourney);
        out.updated = (out.updated || []).map(stabilizeJourney);
        out.merged = (out.merged || []).map(m => ({ from: m.from, to: stabilizeJourney(m.to) }));

        // 8) Compute finalJourneys if omitted; otherwise ensure stabilization.
        if (!out.finalJourneys || out.finalJourneys.length === 0) {
            out.finalJourneys = assembleFinalJourneys({
                original: journeys,
                added: out.added,
                updated: out.updated,
                merged: out.merged,
                removed: out.removed,
            }).map(stabilizeJourney);
        } else {
            out.finalJourneys = out.finalJourneys.map(stabilizeJourney);
        }

        // 9) Attach meta
        out.meta = {
            ...(out.meta || {}),
            requestId,
            provider: provider.name,
            tookMs: Date.now() - startedAt,
        };

        // 10) Gentle one-shot retry if nothing improved
        if (shouldNudgeRetry(out, journeys.length)) {
            logger.debug('[JourneysRefinerService] no-op proposal; issuing one-shot nudge retry');
            const retry = await provider.complete({
                system,
                prompt:
                    prompt +
                    '\nIMPORTANT: Current proposal does not improve coverage. Add at least 3 targeted journeys to cover missing transitions/routes.',
                json: true,
                maxTokens,
                timeoutMs,
                temperature: 0.35, // allow mild exploration
            });

            const retryCandidate = (retry.json ?? (retry.text ? safeParseJson(retry.text) : null)) || {};
            const retried = RefineJourneysResponseSchema.parse(retryCandidate);

            // If retry produced meaningful changes, accept & restabilize.
            if (!shouldNudgeRetry(retried, journeys.length)) {
                retried.added = (retried.added || []).map(stabilizeJourney);
                retried.updated = (retried.updated || []).map(stabilizeJourney);
                retried.merged = (retried.merged || []).map(m => ({ from: m.from, to: stabilizeJourney(m.to) }));
                retried.finalJourneys = (retried.finalJourneys || []).map(stabilizeJourney);
                retried.meta = {
                    ...(retried.meta || {}),
                    requestId,
                    provider: provider.name,
                    tookMs: Date.now() - startedAt,
                };
                out = retried;
            }
        }

        logger.info(
            '[JourneysRefinerService] done req=%s Δ+=%d Δupd=%d Δmerged=%d Δrm=%d final=%d took=%dms',
            requestId,
            out.added.length,
            out.updated.length,
            out.merged.length,
            out.removed.length,
            out.finalJourneys.length,
            out.meta?.tookMs ?? (Date.now() - startedAt)
        );

        return out;
    }
}