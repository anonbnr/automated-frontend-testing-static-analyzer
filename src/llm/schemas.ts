// src/llm/schemas.ts
// ============================================================================
// Runtime validation for /llm/journeys/refine using Zod.
// ----------------------------------------------------------------------------
// Shapes mirror the backend’s existing TypeScript models in /models:
//   - AppNavigation  (nodes/edges/transitions)
//   - RouteMap       (routes + redirections)
//   - UserJourney    (id, rootModule, steps[], intent?, success?, source?)
// ============================================================================

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH VALIDATION
// ----------------------------------------------------------------------------
// Matches models/navigation-graph.ts
// ─────────────────────────────────────────────────────────────────────────────

const GraphNodeType = z.enum([
    'module',
    'route',
    'component',
    'widget',
    'external-route',
    'backend',
    'virtual-route',
]);

const GraphNode = z.object({
    id: z.string().min(1),
    type: GraphNodeType,
    attributes: z.record(z.string(), z.any()).optional(),
    validationRules: z.array(z.string()).optional(),
    triggersFormSubmission: z.boolean().optional(),
});

// Static edges are stable and strictly typed
const StaticGraphRelationType = z.enum(['contains', 'imports', 'declares']);


// Dynamic transitions: accept ANY non-empty string to be forward-compatible
const DynamicGraphRelationType = z.string().min(1);

const GraphRelationBase = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
});

const GraphEdge = GraphRelationBase.extend({
    type: StaticGraphRelationType,
});

const GraphTransition = GraphRelationBase.extend({
    type: DynamicGraphRelationType,
});

export const AppNavigationSchema = z.object({
    nodes: z.array(GraphNode),
    edges: z.array(GraphEdge),
    transitions: z.array(GraphTransition),
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE MAP VALIDATION
// ----------------------------------------------------------------------------
// Matches models/route-info.ts
// ─────────────────────────────────────────────────────────────────────────────

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

const RedirectRoute = z.object({
    route: z.string().min(1),
    module: z.string().optional(),
    redirectTo: z.string().min(1),
    pathMatch: z.enum(['full', 'prefix']).optional(),
});

export const RouteMapSchema = z.object({
    routes: z.array(ComponentRoute).default([]),
    redirections: z.array(RedirectRoute).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// USER JOURNEYS VALIDATION
// ----------------------------------------------------------------------------
// Matches models/user-journeys/user-journey-info.ts
// ─────────────────────────────────────────────────────────────────────────────

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

const JourneyStep = z.object({
    stepType: JourneyStepType,
    nodeId: z.string().min(1),
    via: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

// Optional pruned path (when authoring captures a subgraph)
const PrunedPath = z.object({
    nodes: z.array(z.string()),
    relations: z.array(z.object({
        type: z.string().min(1), // GraphRelationType union is large; keep permissive here
        from: z.string().min(1),
        to: z.string().min(1),
    })),
}).optional();

export const UserJourneySchema = z.object({
    id: z.string().min(1),
    rootModule: z.string().min(1),
    name: z.string().optional(),
    projectRoot: z.string().optional(),
    steps: z.array(JourneyStep).min(1),
    path: PrunedPath,
    intent: z.string().optional(),
    success: z.boolean().optional(),
    source: z.enum(['analyzer', 'llm']).optional(),
});

export const UserJourneyArraySchema = z.array(UserJourneySchema);

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST + RESPONSE VALIDATION
// ----------------------------------------------------------------------------
// Matches /llm/journeys/refine API contract (spec Phase A2)
// ─────────────────────────────────────────────────────────────────────────────

export const RefineJourneysRequestSchema = z.object({
    analysisId: z.string().min(1),
    journeys: UserJourneyArraySchema.min(1),
    routeMap: RouteMapSchema.optional(),
    graph: AppNavigationSchema.optional(),
}).refine(o => !!o.graph || !!o.routeMap, {
    message: 'Either "graph" or "routeMap" must be provided.',
    path: ['graph'],
});

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
        // --- new optional diagnostics the model can (should) return ---
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
        // allow future keys without relaxing core fields
        .catchall(z.any())
        .default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (exported for TS inference)
// ─────────────────────────────────────────────────────────────────────────────

export type RefineJourneysRequest = z.infer<typeof RefineJourneysRequestSchema>;
export type RefineJourneysResponse = z.infer<typeof RefineJourneysResponseSchema>;