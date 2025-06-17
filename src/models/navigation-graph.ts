// ──────────────────────────────────────────────────────────────────────────────
// navigation-graph.ts
//
// Defines the core data model for an application’s **navigation multigraph**.
// All nodes live in one shared collection, and there are two distinct edge
// collections for static (“contains”) vs dynamic (user/navigation) relations.
// ──────────────────────────────────────────────────────────────────────────────

import { NavEventType, UserEventType } from "./event-info.js";

/**
 * The type of a graph **node**, indicating its role in the application.
 */
export type GraphNodeType =
    /** A URL route path, e.g. "/dashboard" */
    | "route"
    /** A non-UI target, such as a backend API or third-party redirect */
    | "virtual-route"
    /** An Angular component (root, shared or global) */
    | "component"
    /** A UI widget extracted from a template */
    | "widget"
    ;

/**
 * A **node** in either the static or dynamic graph.
 */
export interface GraphNode {
    /**
     * A globally unique identifier for this node
     * (e.g. route path, widget ID, component selector).
     */
    id: string;

    /**
     * The semantic type of this node.
     */
    type: GraphNodeType;

    /**
     * Arbitrary attributes associated with the node,
     * such as HTML widget attributes, component metadata, etc.
     */
    attributes?: Record<string, any>;

    /**
     * For form widgets, the list of validation rule names
     * (e.g. ["required","minLength"]).
     */
    validationRules?: string[];

    /**
     * `true` if this widget triggers form submission
     * (e.g. `<button type="submit">`).
     * Only applicable when `type === "widget"`.
     */
    triggersFormSubmission?: boolean;
}

/**
 * Allowed **static** relation types between nodes.
 * Currently only "contains" is used:
 *
 * - route  --contains--> component
 * - component --contains--> widget
 * - component --contains--> component
 * - widget --contains--> widget
 */
export type StaticGraphRelationType = "contains";

/**
 * Allowed **dynamic** relation types between nodes:
 *
 * **UserEventType**:
 *   - 'click'        → widget --click--> route
 *   - 'submit'       → form   --submit--> route
 *   - 'input'        → widget --input--> route
 *   - 'change'       → widget --change--> route
 *   - *custom strings*
 *
 * **NavEventType**:
 *   - 'routerLink'       → widget --routerLink--> route
 *   - 'href'             → anchor --href--> route
 *   - 'static-redirect'  → route  --static-redirect--> route
 */
export type DynamicGraphRelationType = UserEventType | NavEventType;

/**
 * Union of all relation types.
 */
export type GraphRelationType = StaticGraphRelationType | DynamicGraphRelationType;

/**
 * A generic **edge** in the multigraph, used for both static and dynamic.
 */
export interface GraphRelation {
    /** Source node ID */
    from: string;
    /** Destination node ID */
    to: string;
    /** Relation type (static or dynamic) */
    type: GraphRelationType;
    /** Optional metadata for this transition */
    metadata?: Record<string, any>;
}

/**
 * A **static** graph edge, restricted to `StaticGraphRelationType`.
 */
export interface GraphEdge extends GraphRelation {
    type: StaticGraphRelationType;
}

/**
 * A **dynamic** graph transition, restricted to `DynamicGraphRelationType`.
 */
export interface GraphTransition extends GraphRelation {
    type: DynamicGraphRelationType;
}

/**
 * The full navigation multigraph:
 *  - `nodes` : the shared node set  
 *  - `staticEdges`  : structural “contains” relations  
 *  - `dynamicEdges` : event‐driven transitions  
 */
export interface AppNavigation {
    /** All nodes (routes, components, widgets, virtual) */
    nodes: GraphNode[];
    /** All static “contains” edges */
    edges: GraphEdge[];
    /** All dynamic event‐driven edges */
    transitions: GraphTransition[];
}