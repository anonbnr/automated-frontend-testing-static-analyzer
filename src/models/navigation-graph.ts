// ──────────────────────────────────────────────────────────────────────────────
// models/navigation-graph.ts
//
// Purpose
//   Core data model for the application's navigation *multigraph*:
//     - GraphNodeType            : semantic roles for nodes
//     - GraphNode                : shared node shape for module/route/component/widget/etc.
//     - StaticGraphRelationType  : structural edges (contains/imports/declares)
//     - DynamicGraphRelationType : event- and load-driven transitions
//     - GraphEdge / GraphTransition
//     - AppNavigation            : the full graph snapshot (nodes + edges + transitions)
//
// Multigraph assumptions
//   • Node IDs are globally unique across all node kinds.
//   • Multiple edges between the same (from, to) are allowed (i.e., a multigraph).
//   • `edges` are static/structural; `transitions` are dynamic/event-driven.
//
// Notes
//   • Route node IDs use Angular path segments (no leading slash); a top-level
//     route like "/" may be represented as "" or a canonical root id by the builder.
//   • `virtual-route` nodes represent UI-only “targets” (e.g., effects, toasts,
//     or non-navigational outcomes) to keep transitions explicit even when no URL changes.
//   • `external-route` nodes represent http/https links beyond the app's router.
// ──────────────────────────────────────────────────────────────────────────────

import { NavEventType, UserEventType } from "./event-info.js";

/**
 * Semantic roles that a graph node can play.
 */
export type GraphNodeType =
    /** An Angular module (decorated with @NgModule). */
    | "module"
    /** A URL route path (Angular path segment, e.g., "dashboard", "users/:id"). */
    | "route"
    /** An Angular component (decorated with @Component). */
    | "component"
    /** A UI widget extracted from a template. */
    | "widget"
    /** An external http/https destination (outside Angular Router). */
    | "external-route"
    /** A backend/service endpoint (used to model service-led effects). */
    | "backend"
    /**
    * A UI-only effect target (no URL change), e.g., opening a modal,
    * showing a toast, or other virtual destinations.
    */
    | "virtual-route";
;

/**
 * A single node in the navigation graph.
 */
export interface GraphNode {
    /**
    * Globally unique identifier (e.g., module/class name, route path segment,
    * component selector, or widget ID). Uniqueness holds across node kinds.
    */
    id: string;

    /** The semantic role of this node. */
    type: GraphNodeType;

    /** 
    * Arbitrary JSON-serializable metadata for this node (labels, roles, source locations).
    * Must be safe to stringify (no functions/Map/Set).
    */
    attributes?: Record<string, any>;

    /**
    * For form widgets: list of validation rule names (e.g., ["required","minLength"]).
    * Only meaningful when `type === "widget"`.
    */
    validationRules?: string[];

    /**
    * True if this widget triggers form submission (only for `type === "widget"`).
    */
    triggersFormSubmission?: boolean;
}

/**
 * Static relation types (“structural” edges).
 *
 * 1) **contains**
 *    - (routing) module → route
 *    - route → component
 *    - component → component (e.g., nested layout)
 *    - component → widget
 *    - widget → widget (template subtree)
 *
 * 2) **imports** / **declares**
 *    - module → module
 *    - module → component
 */
export type StaticGraphRelationType
    = "contains"
    | "imports"
    | "declares";

/**
 * Dynamic relation types (user actions & navigation).
 *
 * - **UserEventType**:
 *    click, submit, input, change, …
 *
 * - **NavEventType**:
 *    routerLink, href, static-redirect, navigate, navigateByUrl, service-call
 *
 * - `"lazy-load"`:
 *    modules that lazily load other modules via `loadChildren`
 */
export type DynamicGraphRelationType
    = UserEventType
    | NavEventType
    | "lazy-load";

/** Union of all possible relation types. */
export type GraphRelationType = StaticGraphRelationType | DynamicGraphRelationType;

/**
 * A generic relation in the navigation multigraph.
 */
export interface GraphRelation {
    /** Source node ID */
    from: string;

    /** Destination node ID */
    to: string;

    /** Relation type (static or dynamic) */
    type: GraphRelationType;

    /** Optional metadata (e.g., route params, handler name, source location). */
    metadata?: Record<string, any>;
}

/**
 * A static “contains/imports/declares” edge.
 */
export interface GraphEdge extends GraphRelation {
    type: StaticGraphRelationType;
}

/**
 * A dynamic, event-driven transition edge.
 */
export interface GraphTransition extends GraphRelation {
    type: DynamicGraphRelationType;
}

/**
 * The complete navigation multigraph snapshot.
 */
export interface AppNavigation {
    /** All nodes (modules, routes, components, widgets, external/virtual targets, etc.). */
    nodes: GraphNode[];

    /** All static edges (“contains”, “imports”, “declares”). */
    edges: GraphEdge[];

    /** All dynamic transitions (user events, router links, redirects, lazy loads, etc.). */
    transitions: GraphTransition[];
}