// ──────────────────────────────────────────────────────────────────────────────
// models/navigation-graph.ts
//
// Defines the core data model for an application’s **navigation multigraph**.
// - GraphNodeType          (semantic roles for each node)
// - GraphNode              (shared node type for route/module/component/widget)
// - StaticGraphRelationType  (“contains” / “imports” / “declares” edges)
// - DynamicGraphRelationType (user & nav event transitions)
// - GraphEdge & GraphTransition
// - AppNavigation          (full graph: nodes + static edges + dynamic transitions)
// ──────────────────────────────────────────────────────────────────────────────

import { NavEventType, UserEventType } from "./event-info.js";

/**
 * Semantic roles that a graph node can play.
 */
export type GraphNodeType =
    /** An Angular module (decorated with @NgModule) */
    | "module"
    /** A URL route path, e.g. "/dashboard" */
    | "route"
    /** A non-UI target, such as a backend or virtual API */
    | "virtual-route"
    /** An external link (http/https) */
    | "external-route"
    /** An Angular component (decorated with @Component) */
    | "component"
    /** A UI widget extracted from a template */
    | "widget"
    ;

/**
 * A single node in the navigation graph.
 */
export interface GraphNode {
    /** Globally unique identifier (route path, module/class name, selector, widget ID). */
    id: string;

    /** The semantic role of this node. */
    type: GraphNodeType;

    /** Arbitrary metadata for this node (e.g. component role, module role, route data). */
    attributes?: Record<string, any>;

    /** For form widgets: list of validation rule names (e.g. ["required","minLength"]). */
    validationRules?: string[];

    /** True if this widget triggers form submission (only for `type === "widget"`). */
    triggersFormSubmission?: boolean;
}

/**
 * Static relation types (“structural” edges).
 *
 * 1. **contains** 
 *    - (routing) module → route
 *    - route → component  
 *    - component → component  
 *    - component → widget  
 *    - widget → widget  
 *
 * 2. **imports** / **declares**:
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
 *    (click, submit, input, change, …)  
 *
 * - **NavEventType**:  
 *    routerLink, href, static-redirect  
 *
 * - `"lazy-load"`:  
 *    modules that lazily load other modules via loadChildren
 */
export type DynamicGraphRelationType
    = UserEventType
    | NavEventType
    | "lazy-load";

/** Union of all possible relation types. */
export type GraphRelationType = StaticGraphRelationType | DynamicGraphRelationType;

/**
 * A generic edge in the navigation multigraph.
 */
export interface GraphRelation {
    /** Source node ID */
    from: string;

    /** Destination node ID */
    to: string;

    /** Relation type (static or dynamic) */
    type: GraphRelationType;

    /** Optional metadata (e.g. route params for navigation). */
    metadata?: Record<string, any>;
}

/**
 * A static “contains” or module-level edge.
 */
export interface GraphEdge extends GraphRelation {
    type: StaticGraphRelationType;
}

/**
 * A dynamic event-driven transition edge.
 */
export interface GraphTransition extends GraphRelation {
    type: DynamicGraphRelationType;
}

/**
 * The complete navigation multigraph.
 */
export interface AppNavigation {
    /** All nodes (modules, routes, components, widgets, virtual targets). */
    nodes: GraphNode[];

    /** All static edges (“contains”, “imports”, “declares”). */
    edges: GraphEdge[];

    /** All dynamic transitions (clicks, routerLinks, redirects, module loads). */
    transitions: GraphTransition[];
}