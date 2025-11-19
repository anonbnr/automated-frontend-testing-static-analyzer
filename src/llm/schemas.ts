// ──────────────────────────────────────────────────────────────────────────────
// llm/schemas.ts
//
//  Zod runtime validation for `/llm/journeys/refine`.
//  These shapes mirror TS models in /models/* while remaining *forward-
//  compatible* in places where the platform may evolve (e.g., dynamic transition
//  kinds, extra meta fields). The contract is kept strict where correctness matters
//  (IDs, step order, presence of minimal fields) and permissive where future
//  additions are likely.
//
//  Design choices
//  --------------
//  • Graph transitions: type is any non-empty string → easy to add new via kinds.
//  • Response meta: `.catchall(z.any())` → models may include extra diagnostics.
//  • Arrays default to [] in the response → downstream code can skip null checks.
//  • Request must include at least one of {graph, routeMap} to anchor reasoning.
// ──────────────────────────────────────────────────────────────────────────────

import { z, ZodError } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH VALIDATION (matches models/navigation-graph.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Node kinds supported by the navigation graph. */
const GraphNodeType = z.enum([
    'module',
    'route',
    'component',
    'widget',
    'external-route',
    'backend',
    'virtual-route',
]);

/** A single graph node. */
const GraphNode = z.object({
    /** Unique node identifier (path, name, or URL). */
    id: z.string().min(1),
    /** Node category used by assemblers/builders. */
    type: GraphNodeType,
    /** Free-form attributes collected during analysis (optional). */
    attributes: z.record(z.string(), z.any()).optional(),
    /** Validation rule identifiers attached to a widget/component (optional). */
    validationRules: z.array(z.string()).optional(),
    /** Heuristic hint used by the assembler for submit-chains (optional). */
    triggersFormSubmission: z.boolean().optional(),
});

/** Static edge kinds defined by the structural graph. */
const StaticGraphRelationType = z.enum(['contains', 'imports', 'declares']);


/** Dynamic transitions are intentionally permissive (forward-compatible). */
const DynamicGraphRelationType = z.string().min(1);

/** Common relation/transition shape. */
const GraphRelationBase = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
});

/** A static relation (edge) between nodes (e.g., contains/imports/declares). */
const GraphEdge = GraphRelationBase.extend({
    type: StaticGraphRelationType,
});

/** A dynamic transition (e.g., click, routerLink, href, service-call, submit). */
const GraphTransition = GraphRelationBase.extend({
    type: DynamicGraphRelationType,
});

/** Full app navigation model used by journey builders. */
export const AppNavigationSchema = z.object({
    nodes: z.array(GraphNode),
    edges: z.array(GraphEdge),
    transitions: z.array(GraphTransition),
});

// ─────────────────────────────────────────────────────────────────────────────
/** ROUTE MAP VALIDATION (matches models/route-info.ts) */
// ─────────────────────────────────────────────────────────────────────────────

/** Angular-like component route entry (use by the intent resolver). */
const ComponentRoute = z.object({
    route: z.string().min(1),
    module: z.string().optional(),
    component: z.string().optional(),
    loadChildren: z.string().optional(),
    loadComponent: z.string().optional(),
    pathMatch: z.enum(['full', 'prefix']).optional(),
    canActivate: z.array(z.string()).optional(),
    canActivateChild: z.array(z.string()).optional(),
    canLoad: z.array(z.string()).optional(),
    resolve: z.record(z.string(), z.string()).optional(),
    data: z.record(z.string(), z.string()).optional(),
});

/** Angular-like redirect entry (used by the intent resolver). */
const RedirectRoute = z.object({
    route: z.string().min(1),
    module: z.string().optional(),
    redirectTo: z.string().min(1),
    pathMatch: z.enum(['full', 'prefix']).optional(),
});

/** Route map: component routes + explicit redirections. */
export const RouteMapSchema = z.object({
    routes: z.array(ComponentRoute).default([]),
    redirections: z.array(RedirectRoute).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
/** USER JOURNEY VALIDATION (matches models/user-journeys/user-journey-info.ts) */
// ─────────────────────────────────────────────────────────────────────────────

/** The allowed set of journey step kinds. */
const JourneyStepType = z.enum([
    'module',
    'route',
    'external-route',
    'virtual-route',
    'component',
    'widget',
    'interaction',
    'backend',
]);

const ActionType = z.enum([
    'navigate',
    'click',
    'submit',
    'input',
    'change',
    'check',
    'uncheck',
    'noop',
    'select',
    'upload',
    'waitFor',
]);

const StageTargetType = z.enum ([
    'route',
    'external',
    'widget',
    'backend',
    'virtual',
]);

const StageTarget = z.object ({
    type: StageTargetType,
    id:z.string().min(1),
    string:z.string().min(1),
});

/** One atomic step in a journey sequence. */
const JourneyStep = z.object({
    /** The semantic kind of this step. */
    stepType: JourneyStepType,
    /** The node identifier this step refers to (path/id/URL). */
    nodeId: z.string().min(1),
    /** Optional interaction “via” (e.g., click, routerLink, href, submit, …). */
    via: z.string().optional(),
    /** Arbitrary extra data (e.g., service/method/sourceEvent). */
    metadata: z.record(z.string(), z.any()).optional(),
});

const JourneyExpandedStep = z.object({
    actionType: ActionType,
    target: StageTarget,
    widgetId: z.string().min(1).optional(),
    validationRules: z.array(z.string()).optional(),
    triggersFormSubmission: z.boolean().optional(),
    sensitiveData: z.boolean().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// Optional pruned path (when authoring captures a subgraph)
const PrunedPath = z.object({
    nodes: z.array(z.string()),
    relations: z.array(z.object({
        type: z.string().min(1), // keep permissive for future relation kinds
        from: z.string().min(1),
        to: z.string().min(1),
    })),
}).optional();

/** A complete user journey (id + ordered steps + optional annotations). */
export const UserJourneySchema = z.object({
    id: z.string().min(1),
    rootModule: z.string().min(1),
    /** Optional human label; the refiner may rename it. */
    name: z.string().optional(),
    /** Optional workspace root (for provenance/storage). */
    projectRoot: z.string().optional(),
    /** Ordered steps. */
    steps: z.array(JourneyStep).min(1),
    expandedSteps: z.array(JourneyExpandedStep).optional(),
    /** Optional embedded subgraph context. */
    path: PrunedPath,
    /** intent bucket derived from terminals. */
    intent: z.string().optional(),
    /** Success flag (computed from error sentinels). */
    success: z.boolean().optional(),
    /** Provenance: 'analyzer' for raw, 'llm' for refined/touched. */
    source: z.enum(['analyzer', 'llm']).optional(),
});

/** Convenience array wrapper. */
export const UserJourneyArraySchema = z.array(UserJourneySchema);

// ─────────────────────────────────────────────────────────────────────────────
/** REQUEST + RESPONSE VALIDATION (for /llm/journeys/refine) */
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request contract:
 *  - analysisId: caller id (also used by rate-limiter).
 *  - journeys: non-empty array of raw journeys (from analyzer or previous run).
 *  - either a graph or a routeMap (or both) must be provided.
 */
export const RefineJourneysRequestSchema = z.object({
    analysisId: z.string().min(1),
    journeys: UserJourneyArraySchema.min(1),
    routeMap: RouteMapSchema.optional(),
    graph: AppNavigationSchema.optional(),
}).refine(o => !!o.graph || !!o.routeMap, {
    message: 'Either "graph" or "routeMap" must be provided.',
    path: ['graph'],
});

/**
 * Response contract:
 *  - Arrays default to [] so consumers can iterate safely.
 *  - meta is extensible (catchall) to let models attach diagnostics.
 *  - finalJourneys may be empty; the service can compute it from the other
 *    fields when the model omits it.
 */
export const RefineJourneysResponseSchema = z.object({
    added: UserJourneyArraySchema.default([]),
    removed: z.array(z.string()).default([]),
    merged: z.array(z.object({
        from: z.array(z.string()).min(1),
        to: UserJourneySchema,
    })).default([]),
    updated: UserJourneyArraySchema.default([]),
    finalJourneys: UserJourneyArraySchema.default([]),
    meta: z.object({
        fromCache: z.boolean().optional(),
        requestId: z.string().optional(),
        tookMs: z.number().optional(),
        provider: z.string().optional(),
        // Optional model-authored diagnostics (pre/post coverage snapshots, etc.)
        understood: z.boolean().optional(),
        before: z.object({
            routeCoveragePct: z.number().optional(),
            backendCoveragePct: z.number().optional(),
            coveredRoutes: z.array(z.string()).optional(),
            missingRoutes: z.array(z.string()).optional(),
            coveredBackends: z.array(z.string()).optional(),
            missingBackends: z.array(z.string()).optional(),
            journeyCount: z.number().optional(),
        }).optional(),
        after: z.object({
            routeCoveragePct: z.number().optional(),
            backendCoveragePct: z.number().optional(),
            journeyCount: z.number().optional(),
        }).optional(),
        notes: z.array(z.string()).optional(),
    })
        // Allow new meta keys without rejecting the payload
        .catchall(z.any())
        .default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (exported for inference in services/routes)
// ─────────────────────────────────────────────────────────────────────────────

export type RefineJourneysRequest = z.infer<typeof RefineJourneysRequestSchema>;
export type RefineJourneysResponse = z.infer<typeof RefineJourneysResponseSchema>;
export type UserJourney = z.infer<typeof UserJourneySchema>;
export type JourneyStep = z.infer<typeof JourneyStep>;
export type AppNavigation = z.infer<typeof AppNavigationSchema>;
export type RouteMap = z.infer<typeof RouteMapSchema>;