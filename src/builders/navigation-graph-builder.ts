// ──────────────────────────────────────────────────────────────────────────────
// builders/navigation-graph-builder.ts
//
// Purpose
//   Construct the application navigation **multigraph** composed of:
//   • Static structure (modules, components, routes, widgets, nesting)
//   • Dynamic transitions (lazy-loads, redirects, routerLink/href/navigate,
//     service/backend calls, and UI-only virtual effects)
//
// Static graph
//   - module ──declares──▶ component
//   - module ──imports ──▶ module
//   - module ──contains──▶ route
//   - route  ──contains──▶ component
//   - component ──contains──▶ nested component(s)
//   - component ──contains──▶ widgets ──contains──▶ nested widgets
//
// Dynamic graph (GraphTransition):
//   - lazy-load       : module ──lazy-load──▶ module
//   - static-redirect : route  ──static-redirect──▶ route
//   - routerLink      : widget ──routerLink──▶ route (or external-route)
//   - navigate        : widget ──navigate/ngNav──▶ route
//   - href            : widget ──href──▶ external-route
//   - service-call    : widget ──service-call──▶ backend(/service(/method))
//   - ui-effect       : widget ──<event>──▶ virtual-route (/ui/...)
//   - submit          : submit-trigger widget ──submit──▶ nearest ancestor <form> widget
//
// Entry points
//   - buildStatic(compRouteMap, moduleRegistry, componentRegistry)
//   - buildDynamic(compRouteMap, moduleRegistry, widgetEventMaps)
//   - getGraph(): AppNavigation
//
// Notes
//   • Node IDs are normalized to collapse duplicate slashes (URLs preserved).
//   • Duplicate nodes/edges/transitions are de-duplicated.
//   • Known route canonicalization is delegated to RoutingUtils.
//   • Widget “effective” type is derived via WidgetUtils.wType for consistent attributes.
//
// ──────────────────────────────────────────────────────────────────────────────

import { LogicUtils } from "../analyzers/business-logic/logic-utils.js";
import { RoutingUtils } from "../analyzers/routes/route-utils.js";
import { WidgetUtils } from "../analyzers/template/widgets/widget-utils.js";
import logger from "../logging/logger.js";
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from "../models/analyzer-config.js";
import { ComponentInfo, ComponentRegistry } from "../models/component-info.js";
import { WidgetEventMap } from "../models/event-info.js";
import { ModuleRegistry } from "../models/module-info.js";
import { AppNavigation, DynamicGraphRelationType, GraphEdge, GraphNode, GraphNodeType, GraphTransition, StaticGraphRelationType } from "../models/navigation-graph.js";
import { ComponentRouteMap, ComponentRouteRole } from "../models/route-info.js";
import { WidgetInfo } from "../models/widget-info.js";
import { AstUtils } from "../parsers/ast-utils.js";

/**
 * NavigationGraphBuilder
 *
 * Orchestrates construction of the static topology and dynamic transitions
 * for the Angular application's navigation multigraph.
 */
export class NavigationGraphBuilder {
    /** Map of nodeId → GraphNode (ensures uniqueness of nodes). */
    private nodes = new Map<string, GraphNode>();

    /** Static edges (module/component/route/widget containment & imports/declares). */
    private edges: GraphEdge[] = [];

    /** Dynamic transitions (runtime navigations, redirects, backend calls, etc.). */
    private transitions: GraphTransition[] = [];

    constructor(private cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG) { }

    // ──────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────────────────────────────────

    /**
    * Build the **static** portion of the graph in three passes:
    *  1) Register modules (+ imports/declares)
    *  2) Register routes (+ module → route linkage if known)
    *  3) Register components (+ nested-components + widget trees)
    */
    buildStatic(
        compRouteMap: ComponentRouteMap,
        moduleRegistry: ModuleRegistry,
        componentRegistry: ComponentRegistry
    ): void {
        logger.debug(
            "[NavigationGraph] buildStatic → modules=%d, routes=%d, components=%d",
            moduleRegistry.modules.length,
            compRouteMap.routeMap.routes.length,
            componentRegistry.components.length
        );
        this._registerModules(moduleRegistry, componentRegistry);
        this._registerRoutes(compRouteMap);
        this._registerComponents(compRouteMap, componentRegistry);
    }

    /**
    * Build the **dynamic** transitions in this order:
    *  1) Module-level lazy-load links (module → module)
    *  2) Route-level static redirects (route → route)
    *  3) Widget-driven transitions (routerLink/href/navigate/backend/ui-effect)
    *  4) Submit-trigger widget → nearest ancestor <form> binding
    */
    buildDynamic(
        compRouteMap: ComponentRouteMap,
        moduleRegistry: ModuleRegistry,
        widgetEventMaps: WidgetEventMap[]
    ): void {
        logger.debug(
            "[NavigationGraph] buildDynamic → routes=%d, modules=%d, widgetMaps=%d",
            compRouteMap.routeMap.routes.length,
            moduleRegistry.modules.length,
            widgetEventMaps.length
        );
        this._registerLazyLoadTransitions(compRouteMap, moduleRegistry);
        this._registerRedirectTransitions(compRouteMap);
        this._registerWidgetTransitions(compRouteMap, widgetEventMaps);
        this._registerFormFieldTransitions();
    }

    /** Return the assembled multigraph snapshot. */
    getGraph(): AppNavigation {
        logger.log('trace', "[NavigationGraph] getGraph()");
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            transitions: this.transitions,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS: STATIC GRAPH
    // ──────────────────────────────────────────────────────────────────────────

    /**
    * Register every NgModule node, plus:
    *  - module → declares → component edges (by selector)
    *  - module → imports  → module edges
    */
    private _registerModules(
        moduleRegistry: ModuleRegistry,
        componentRegistry: ComponentRegistry
    ): void {
        for (const mod of moduleRegistry.modules) {
            // module node with role attribute (root/routing/external/shared/global)
            this._addNode(mod.name, "module", { attributes: { role: mod.role } });

            // module → declares → component (resolve selector; fall back to heuristic)
            for (const compCls of mod.declarations) {
                const compSel = componentRegistry.getByName(compCls)?.selector
                    ?? AstUtils.convertClassNameToSelector(compCls);
                this._addNode(compSel, "component");
                this._addStaticEdge(mod.name, compSel, "declares");
            }

            // module → imports → otherModule
            for (const imported of mod.imports) {
                this._addNode(imported, "module");
                this._addStaticEdge(mod.name, imported, "imports");
            }
        }
    }

    /**
    * Register route nodes and (if known) connect their declaring module → route.
    * Route node attributes preserve guards, resolvers, data, and pathMatch.
    */
    private _registerRoutes(compRouteMap: ComponentRouteMap): void {
        for (const compR of compRouteMap.routeMap.routes) {
            this._addNode(compR.route, "route", {
                attributes: {
                    pathMatch: compR.pathMatch,
                    canActivate: compR.canActivate,
                    canActivateChild: compR.canActivateChild,
                    canLoad: compR.canLoad,
                    resolve: compR.resolve,
                    data: compR.data
                }
            });
            if (compR.module)
                // module → route containment (declaring module known from earlier assignment)
                this._addStaticEdge(compR.module, compR.route);
        }
    }

    /**
    * Register all component nodes (with role), connect:
    *  - route → component (for each route mapping the selector)
    *  - component → nested component(s)
    *  - component → widgets (entire widget subtree)
    */
    private _registerComponents(
        compRouteMap: ComponentRouteMap,
        componentRegistry: ComponentRegistry
    ): void {
        for (const ci of componentRegistry.components) {
            const role = this._lookupComponentRole(ci.selector, compRouteMap.roles);

            // component node with role attribute
            this._addNode(ci.selector, "component", { attributes: { role } });

            // route → component for each direct mapping
            for (const path of RoutingUtils.getRoutesFromSelector(ci.selector, compRouteMap.routeMap))
                this._addStaticEdge(path, ci.selector);

            // component → nested-component edges
            for (const child of ci.nestedComponents) {
                this._addNode(child, "component");
                this._addStaticEdge(ci.selector, child);
            }

            // component → widgets (flattened recursively)
            for (const w of ci.widgets)
                this._registerWidgets(w, ci.selector);
        }
    }

    /**
    * Recursively register a widget and any nested widgets, attaching:
    *  - attributes (original + effective widgetType + declared events)
    *  - validationRules (if present)
    *  - contains edge from its parent (component or widget)
    */
    private _registerWidgets(
        widget: WidgetInfo,
        parentId: string
    ): void {
        // compute effective type once for consistent metadata
        const effectiveType = WidgetUtils.wType(widget);

        // merge original attributes + effective type + declared events
        const metaAttrs = {
            ...widget.attributes,
            events: widget.events,
            widgetType: effectiveType
        };

        // widget node
        this._addNode(widget.id, "widget", {
            attributes: metaAttrs,
            validationRules: widget.validationRules,
            triggersFormSubmission: widget.triggersFormSubmission,
        });

        // parent ──contains──▶ widget
        this._addStaticEdge(parentId, widget.id);

        // nested widgets
        for (const child of widget.children || [])
            this._registerWidgets(child, widget.id);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS: DYNAMIC GRAPH
    // ──────────────────────────────────────────────────────────────────────────

    /**
    * Emit module → module `lazy-load` transitions for each route with `loadChildren`.
    * The "from" side is the route's declaring module; the "to" module(s) are parsed
    * from the `then(m => m.TargetModule)` patterns.
    */
    private _registerLazyLoadTransitions(
        compRouteMap: ComponentRouteMap,
        moduleRegistry: ModuleRegistry
    ): void {
        const LOAD_RE = /\.then\(\s*\w+\s*=>\s*\w+\.(\w+)\)/g;

        for (const r of compRouteMap.routeMap.routes) {
            // Skip if there's no lazy-loading or declaring module for a route
            if (!r.loadChildren || !r.module)
                continue;

            // Declaring module
            const fromModule = r.module;

            let match: RegExpExecArray | null;
            while ((match = LOAD_RE.exec(r.loadChildren))) {
                const targetModule = match[1];
                if (moduleRegistry.getByName(targetModule)) {
                    this._addNode(fromModule, "module");
                    this._addNode(targetModule, "module");
                    this._addDynamicTransition(fromModule, targetModule, "lazy-load");
                }
            }
        }
    }

    /**
    * Emit route → route `static-redirect` transitions based on redirect entries.
    */
    private _registerRedirectTransitions(compRouteMap: ComponentRouteMap): void {
        for (const rd of compRouteMap.routeMap.redirections) {
            this._addNode(rd.route, "route", { attributes: { pathMatch: rd.pathMatch } });
            this._addNode(rd.redirectTo, "route");
            this._addDynamicTransition(
                rd.route,
                rd.redirectTo,
                "static-redirect",
                { pathMatch: rd.pathMatch }
            );
        }
    }

    /**
    * Emit widget-driven transitions:
    *  - href → external-route
    *  - routerLink → route (canonicalized) | external-route | (else) virtual-route
    *  - router.navigate / navigateByUrl([...]) → route (canonicalized)
    *  - backend/service/http calls → /backend(/service(/method)) per config granularity
    *  - UI-only effects → virtual-route (/ui/<widget>/<label>)
    */
    private _registerWidgetTransitions(
        compRouteMap: ComponentRouteMap,
        widgetEventMaps: WidgetEventMap[]
    ): void {
        const knownRoutes = new Set(compRouteMap.routeMap.routes.map(r => r.route));
        const ensureLeadingSlash = (s: string) => (s.startsWith('/') ? s : `/${s}`);

        for (const wem of widgetEventMaps) {
            for (const ev of wem.eventContexts) {
                // Working sets for this event context
                const navTargets = new Set<string>(); // resolved route targets
                const backendCalls = new Map<string, { service: string; method: string }>(); // unique by "service.method"
                const uiEffects: string[] = []; // record for metadata only

                for (const call of ev.callContexts) {
                    const called = String(call.called || '').trim();
                    // 1) skip empty targets
                    if (!called) continue;

                    // 2) href → external-route (literal URL)
                    if (ev.event === 'href') {
                        this._addNode(called, 'external-route');
                        this._addDynamicTransition(wem.widgetID, called, ev.event, { params: call.data, handler: ev.handler });
                        continue;
                    }

                    // 3) routerLink → try canonical known route (or external/virtual higher up)
                    if (ev.event === 'routerLink') {
                        const canonical = RoutingUtils.canonicalizeToKnownRoute(ensureLeadingSlash(called), knownRoutes);
                        if (knownRoutes.has(canonical)) navTargets.add(canonical);
                        continue;
                    }

                    // 4) router.navigate / navigateByUrl([...]) → join segments then canonicalize
                    const isNav = LogicUtils.isRouterNavigateCall(`${call.caller}.${call.called}`)
                        && Array.isArray(call.data) && call.data.length;

                    if (isNav) {
                        const raw = ensureLeadingSlash(call.data.join('/'));
                        const canonical = RoutingUtils.canonicalizeToKnownRoute(raw, knownRoutes);
                        if (knownRoutes.has(canonical)) navTargets.add(canonical);
                        continue;
                    }

                    // 5) backend/service/http calls → /backend(/service(/method))
                    const isBackend = (Array.isArray(call.data) && call.data[0] === '/backend')
                        || LogicUtils.isBackendServiceCaller(call.caller, this.cfg);

                    if (isBackend) {
                        // drop configured noise methods
                        if (this.cfg.noise.methodNames.has(call.called)) continue;


                        const rawService =
                            (Array.isArray(call.data) && call.data[1]) ||
                            call.caller.replace(/^this\./, '').split('.')[0];
                        const service = this.cfg.backend.normalizeServiceName(rawService);
                        const method = (Array.isArray(call.data) && call.data[2]) || call.called || 'call';
                        backendCalls.set(`${service}.${method}`, { service, method });
                        continue;
                    }

                    // 6) Everything else is UI-only side-effects (record for metadata; no nav/endpoint)
                    uiEffects.push(called);
                }

                // Emit resolved route navigation (choose one deterministically)
                const nav = Array.from(navTargets).sort()[0];
                if (nav) {
                    this._addNode(nav, 'route');
                    this._addDynamicTransition(wem.widgetID, nav, ev.event, { handler: ev.handler, uiEffects });
                }

                // Emit backend service-call transitions per config granularity
                for (const { service, method } of backendCalls.values()) {
                    const base = '/backend';
                    const g = this.cfg.backend.granularity;
                    const target =
                        g === 'single' ? base :
                            g === 'service' ? `${base}/${service}` :
                                `${base}/${service}/${method}`;

                    this._addNode(target, 'backend');
                    this._addDynamicTransition(wem.widgetID, target, 'service-call', { service, method, sourceEvent: ev.event, handler: ev.handler, uiEffects });
                }

                // If no route nav and no backend calls → emit a virtual UI-effect target
                if (!nav && backendCalls.size === 0) {
                    const label = (ev.handler && ev.handler.trim()) || uiEffects[0] || String(ev.event);
                    const target = `/ui/${wem.widgetID}/${label}`;
                    this._addNode(target, 'virtual-route', {
                        attributes: { kind: 'ui-effect', handler: ev.handler, uiEffects }
                    });
                    this._addDynamicTransition(
                        wem.widgetID,
                        target,
                        ev.event as any, // e.g. 'click', 'input'
                        { handler: ev.handler, uiEffects }
                    );
                }
            }
        }
    }

    /**
    * For each widget that *triggers* form submission (e.g., <button type="submit">),
    * add a single 'submit' transition to its nearest ancestor <form> widget:
    *
    *   (submit-trigger widget) --submit--> (form widget)
    *
    * The <form> node itself remains the entity that can own submit→route/backend
    * transitions; field-level events are not duplicated as submit transitions.
    */
    private _registerFormFieldTransitions(): void {
        for (const node of this.nodes.values()) {
            if (node.type !== 'widget') continue;

            const isSubmitTrigger =
                node.triggersFormSubmission === true;
            if (!isSubmitTrigger) continue;

            const formId = this._findNearestAncestorForm(node.id);
            if (!formId) continue;

            // Single, canonical submit link from the trigger to the form
            this._addDynamicTransition(node.id, formId, 'submit', { sourceEvent: 'click' });
        }

    }

    /**
    * Walk static 'contains' edges upward from a widget to find the nearest
    * ancestor widget whose effective type is 'form'.
    */
    private _findNearestAncestorForm(startId: string): string | undefined {
        let cur = startId;

        // Find parent via static 'contains' edges: (parent ──contains──▶ child)
        const findParent = (childId: string) =>
            this.edges.find(e => e.type === 'contains' && e.to === childId)?.from;

        while (true) {
            const parentId = findParent(cur);
            if (!parentId) return undefined;

            const parent = this.nodes.get(parentId);
            const pType = parent?.attributes?.widgetType as string | undefined;
            const isForm = parent?.type === 'widget' && (pType === 'form');

            if (isForm) return parentId;
            cur = parentId;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS: NODES & EDGES
    // ──────────────────────────────────────────────────────────────────────────

    /**
    * Add a node if missing. Full URLs are preserved; other IDs have duplicate
    * slashes collapsed via `_normalizeId`.
    */
    private _addNode(
        rawId: string,
        type: GraphNodeType,
        partial?: Partial<GraphNode>
    ): void {
        const id = this._normalizeId(rawId);
        if (!this.nodes.has(id)) {
            logger.log('trace', "[NavigationGraph] ⬤ addNode → %s (%s)", id, type);
            this.nodes.set(id, { id, type, ...partial });
        }
    }

    /**
    * Add a static edge if not already present.
    *
    * @param type Defaults to 'contains', but also used for 'imports'/'declares'.
    */
    private _addStaticEdge(
        rawFrom: string,
        rawTo: string,
        type: StaticGraphRelationType = "contains"
    ): void {
        const from = this._normalizeId(rawFrom);
        const to = this._normalizeId(rawTo);

        if (!this.edges.some(e => e.from === from && e.to === to && e.type === type)) {
            logger.log(
                'trace',
                "[NavigationGraph] — addStaticEdge → %s → %s [%s]",
                from,
                to,
                type
            );
            this.edges.push({ from, to, type });
        }
        else
            logger.log(
                'trace',
                "[NavigationGraph] — skipStaticEdge (exists) → %s → %s [%s]",
                from,
                to,
                type
            );
    }

    /**
    * Add a dynamic transition if not already present.
    */
    private _addDynamicTransition(
        rawFrom: string,
        rawTo: string,
        type: DynamicGraphRelationType,
        metadata?: Record<string, any>
    ): void {
        const from = this._normalizeId(rawFrom);
        const to = this._normalizeId(rawTo);

        if (!this.transitions.some(t => t.from === from && t.to === to && t.type === type)) {
            logger.log(
                'trace',
                "[NavigationGraph] ➝ addDynamicTransition → %s → %s [%s] %o",
                from,
                to,
                type,
                metadata
            );
            this.transitions.push({ from, to, type, metadata });
        }
        else {
            logger.log(
                'trace',
                "[NavigationGraph] ➝ skipDynamicTransition (exists) → %s → %s [%s]",
                from,
                to,
                type
            );
        }
    }

    /**
    * Look up the role assigned to a component in the ComponentRouteMap.
    * Defaults to 'mapped' if not matched in any explicit role array.
    */
    private _lookupComponentRole(
        selector: string,
        roles: Record<ComponentRouteRole, ComponentInfo[]>
    ): ComponentRouteRole {
        if (roles.dead.some(c => c.selector === selector)) return 'dead';
        if (roles.global.some(c => c.selector === selector)) return 'global';
        if (roles.shared.some(c => c.selector === selector)) return 'shared';
        if (roles.mapped.some(c => c.selector === selector)) return 'mapped';
        return 'mapped';  // default role
    }

    /**
    * Normalize IDs by collapsing repeated slashes, preserving full HTTP(S) URLs.
    */
    private _normalizeId(id: string): string {
        // preserve URLs
        if (/https?:\/\//i.test(id)) return id;
        return id.replace(/\/{2,}/g, '/');
    }
}