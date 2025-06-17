// ──────────────────────────────────────────────────────────────────────────────
// navigation-graph-builder.ts
//
// Builds an application’s **navigation multigraph** in three steps:
//
//   1) **Static “contains”** relationships (route → component → nested component/widget).
//   2) **Static redirects** (route → route via 'static-redirect').
//   3) **Dynamic event-driven** transitions (click, submit, routerLink, navigate, etc.).
//
// Along the way we tag every component node with its **role** (root/global/shared/mapped/dead).
//
// Internally maintains a single shared node set (`nodes`) and two edge lists:
//   - `edges`       — static GraphEdge[] (“contains” relations)  
//   - `transitions` — dynamic GraphTransition[] (user/navigation events)  
//
// Finally emits an `AppNavigation` structure for downstream use.
// ──────────────────────────────────────────────────────────────────────────────

import { RoutingUtils } from "../analyzers/routes/route-utils.js";
import { ComponentInfo, ComponentRegistry } from "../models/component-info.js";
import { WidgetEventMap } from "../models/event-info.js";
import { AppNavigation, DynamicGraphRelationType, GraphEdge, GraphNode, GraphNodeType, GraphTransition, StaticGraphRelationType } from "../models/navigation-graph.js";
import { ComponentRouteMap, ComponentRouteRole, RouteMap } from "../models/route-info.js";
import { WidgetInfo } from "../models/widget-info.js";

/**
 * @TODO update documentation similarly to previous modules
 * Orchestrates construction of the full navigation multigraph.
 *
 * Maintains:
 *   - `nodes`       – all GraphNode entries (routes, components, widgets, virtual targets)
 *   - `edges`       – all static “contains” GraphEdge entries
 *   - `transitions` – all dynamic GraphTransition entries
 *
 * Call in three phases:
 *   1) `buildStaticRoutes(routeMap)`
 *   2) `buildStaticComponent(routeMap, component)` for each ComponentInfo
 *   3) `buildDynamic(routeMap, components, widgetEventMaps)`
 *
 * Finally retrieve via `.getGraph()`.
 */
export class NavigationGraphBuilder {
    /**
     * Shared map of nodeId → GraphNode
     */
    private nodes: Map<string, GraphNode> = new Map();

    /**
     * Static “contains” edges (type === "contains")
     */
    private edges: GraphEdge[] = [];

    /**
     * Dynamic event‐driven transitions
     */
    private transitions: GraphTransition[] = [];

    /**
     * Returns the fully assembled navigation multigraph.
     *
     * @returns An `AppNavigation` containing:
     *   - `nodes`: all routes, components, widgets, and virtual targets
     *   - `edges`: all static “contains” relationships
     *   - `transitions`: all dynamic event-driven flows
     */
    getGraph(): AppNavigation {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            transitions: this.transitions,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // NODE REGISTRATION
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Registers a node if not already present.
    *
    * @param id      Globally unique node ID (route path, component selector, widget ID, or virtual route)
    * @param type    Semantic node type ("route"|"component"|"widget"|"virtual-route")
    * @param partial Optional extras (e.g. `{ attributes: { role: "shared" } }` on components)
    */
    private _addNode(id: string, type: GraphNodeType, partial?: Partial<GraphNode>) {
        id = id.replace(/\/{2,}/g, '/');
        if (!this.nodes.has(id))
            this.nodes.set(id, { id, type, ...partial });
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STATIC EDGE RELATIONS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Phase 1: register **all** routes, components, nested-components and widgets
     * as nodes, *and* tag each component node with its `ComponentRouteRole`
     * (“root” | “global” | “shared” | “mapped” | “dead”).
     *
     * @param compRouteMap The Component Route Map including raw routes + `roles` record
     * @param registry The component registry containing all the components of the project
     */
    buildStatic(compRouteMap: ComponentRouteMap, registry: ComponentRegistry) {
        // ─── 0) root component ────────────────────────────────
        const rootNode = compRouteMap.roles.root[0]?.selector;
        if (rootNode) {
            // 1) add the root node itself
            this._addNode(rootNode, "component", {
                attributes: { role: "root" }
            });

            // 2) connect the root node to the root route
            this._addStaticEdge('/', rootNode);

            // 3) connect the root node to its children components
            const rootCi = registry.getBySelector(rootNode);
            if (rootCi) {
                for (const childSel of rootCi.nestedComponents) {
                    let role = this._assignRole(childSel, compRouteMap.roles);
                    this._addNode(childSel, "component", { attributes: { role } });
                    this._addStaticEdge(rootNode, childSel);

                    // child widgets of nested components will be added below
                }

                // 4) connect the root node to its widget components that are not contained in nested components
                for (const w of rootCi.widgets)
                    this._registerWidgetsRecursively(w, rootCi.selector);
            }
        }

        // ─── 1) routes ──────────────────────────────────────────────────────────
        for (const { route } of compRouteMap.routeMap.routes) {
            this._addNode(route, "route");
        }

        // ─── 2) components (with role attribute) ───────────────────────────────
        for (const ci of registry.components) {
            // skip the root entry—it's already been handled
            if (ci.selector === rootNode)
                continue;

            // derive role from compRouteMap.roles.*
            let role = this._assignRole(ci.selector, compRouteMap.roles);

            this._addNode(ci.selector, "component", {
                attributes: { role }
            });

            // 2a) route → component
            const paths = RoutingUtils.getRoutesFromSelector(
                ci.selector,
                compRouteMap.routeMap
            );
            for (const path of paths)
                this._addStaticEdge(path, ci.selector);

            // 2b) nested-components
            for (const child of ci.nestedComponents) {
                let role = this._assignRole(child, compRouteMap.roles);
                this._addNode(child, "component", { attributes: { role } });
                this._addStaticEdge(ci.selector, child);
            }

            // 3) widgets under this component
            for (const w of ci.widgets)
                this._registerWidgetsRecursively(w, ci.selector);
        }
    }

    /**
     * @TODO update documentation similarly to previous modules
     * @param widget 
     * @param parentId 
     */
    private _registerWidgetsRecursively(
        widget: WidgetInfo,
        parentId: string
    ) {
        // 1) register this widget as a node
        this._addNode(widget.id, "widget", {
            attributes: widget.attributes,
            validationRules: widget.validationRules,
            triggersFormSubmission: widget.triggersFormSubmission,
        });

        // 2) connect it to its parent (component or parent widget)
        this._addStaticEdge(parentId, widget.id);

        // 3) dive into any nested widgets
        if (widget.children)
            for (const child of widget.children)
                this._registerWidgetsRecursively(child, widget.id);
    }

    /**
     * Assigns a `ComponentRouteRole` to the component identified by its selector ("mapped" by default)
     * 
     * @param selector the selector of the component to tag
     * @param roles the roles dictionary in the component route map
     * @returns the `ComponentRouteRole` to be assigned to the component
     */
    private _assignRole(selector: string, roles: Record<ComponentRouteRole, ComponentInfo[]>): ComponentRouteRole {
        const { global, shared, mapped, dead } = roles;
        if (dead.some(c => c.selector === selector))
            return "dead";
        if (shared.some(c => c.selector === selector))
            return "shared";
        if (global.some(c => c.selector === selector))
            return "global";
        if (mapped.some(c => c.selector === selector))
            return "mapped";

        return "mapped";
    }

    /**
     * Adds a static “contains” edge if it doesn’t already exist.
     *
     * @param from   Source node ID (route or component)
     * @param to     Destination node ID (component, nested component, or widget)
     * @param type   Edge Relation type (by default "contains")
     */
    private _addStaticEdge(from: string, to: string, type: StaticGraphRelationType = "contains") {
        const exists = this.edges.find(e => e.from === from && e.to === to && e.type === type);
        if (!exists)
            this.edges.push({ from, to, type });
    }

    // ────────────────────────────────────────────────────────────────────────────
    // DYNAMIC TRANSITION RELATIONS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Adds a dynamic transition if not already present.
     *
     * @param from     Source node ID (widget or route)
     * @param to       Destination node ID (route, virtual-route, etc.)
     * @param type     Transition type (`UserEventType` or `NavEventType`)
     * @param metadata Optional metadata (e.g. route parameters)
     */
    private _addDynamicTransition(from: string, to: string, type: DynamicGraphRelationType, metadata?: Record<string, any>) {
        const exists = this.transitions.some(t => t.from === from && t.to === to && t.type === type);
        if (!exists)
            this.transitions.push({ from, to, type, metadata });
    }

    /**
     * Builds all dynamic transitions:
     *  1) Ensures every route & widget node exists  
     *  2) Adds static-redirect flows from `RouteMap.redirections`  
     *  3) Converts each `WidgetEventMap` to event-driven transitions  
     *
     * @param routeMap        Full `RouteMap` (includes `routes` and `redirections`)
     * @param components      All `ComponentInfo` entries
     * @param widgetEventMaps All widget-event call contexts
     */
    buildDynamic(
        routeMap: RouteMap,
        components: ComponentInfo[],
        widgetEventMaps: WidgetEventMap[]
    ): void {
        // a) Ensure route & widget nodes
        for (const cmp of components) {
            const parentRoutes = RoutingUtils.findParentRoutes(cmp, components, routeMap)
                .map(r => r.replace(/\/{2,}/g, '/'))         // collapse any existing double-slashes
                .map(r => r.startsWith('/') ? r : `/${r}`); // ensure a leading slash
            parentRoutes.forEach(r => this._addNode(r, "route"));
            cmp.widgets.forEach(w => this._addNode(w.id, "widget"));
        }

        // b) Static-redirect transitions
        for (const { route, redirectTo } of routeMap.redirections) {
            this._addNode(route, "route");
            this._addNode(redirectTo, "route");
            this._addDynamicTransition(route, redirectTo, "static-redirect");
        }

        // c) Widget-event transitions
        // Precompute the set of all normalized route IDs, e.g. "/posts", "/users", etc.
        const knownRoutes = new Set(routeMap.routes.map(r => r.route));
        for (const wem of widgetEventMaps) {
            for (const ev of wem.events) {
                for (const call of ev.calls) {
                    // If no target is called, skip
                    if (!call.called)
                        continue;

                    // Normalize the target
                    let called = call.called.startsWith("/")
                        ? call.called
                        : `/${call.called}`;

                    let target: string = called;
                    let nodeType: GraphNodeType = "route";

                    // it's a real route
                    if (knownRoutes.has(called))
                        nodeType = "route";
                    // virtual route
                    else {
                        target = `/virtual${target}`;
                        nodeType = "virtual-route";
                    }

                    this._addNode(target, nodeType);
                    this._addDynamicTransition(wem.widgetID, target, ev.event, { params: call.data });
                }
            }
        }
    }
}