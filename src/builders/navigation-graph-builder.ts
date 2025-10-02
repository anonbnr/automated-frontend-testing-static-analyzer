// ──────────────────────────────────────────────────────────────────────────────
// builders/navigation-graph-builder.ts
//
// Constructs the navigation **multigraph** for an Angular app.
// 
// Static graph:
//   - modules → modules (imports)
//   - modules → components (declares)
//   - modules → routes
//   - routes → components
//   - components → nested-components
//   - components → widgets → nested-widgets
//
// Dynamic graph:
//   - lazy-load      (module → module via loadChildren)
//   - static-redirect (route → route redirects)
//   - routerLink/navigate (widget → route)
//   - href           (widget → external-route)
//   - other events   (widget → virtual-route)
//
// Entry points:
//   - buildStatic(compRouteMap, moduleRegistry, componentRegistry)
//   - buildDynamic(compRouteMap, moduleRegistry, componentRegistry, widgetEventMaps)
//   - getGraph(): AppNavigation
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
 * Orchestrates building both the **static** and **dynamic** portions
 * of an application's navigation multigraph.
 */
export class NavigationGraphBuilder {
    /** Map of nodeId → GraphNode (de-duplicated) */
    private nodes = new Map<string, GraphNode>();

    /** All static “contains” / “imports” / “declares” edges */
    private edges: GraphEdge[] = [];

    /** All dynamic event-driven or navigation transitions */
    private transitions: GraphTransition[] = [];

    constructor(private cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG) { }

    // ──────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Build the **static** graph:
     * 1. modules → imports
     * 2. modules → declares components
     * 3. modules → routes
     * 4. routes → components
     * 5. components → nested‐components
     * 6. components → widgets → nested‐widgets
     *
     * @param compRouteMap - raw routes + roles
     * @param moduleRegistry - all NgModule metadata
     * @param componentRegistry - all ComponentInfo metadata
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
     * Build the **dynamic** transitions in the following order:
     * 1. lazy-load (module → module)
     * 2. static-redirect (route → route)
     * 3. widget events (routerLink, navigate, href, virtual-route)
     *
     * @param compRouteMap - raw routes + roles
     * @param moduleRegistry - all NgModule metadata
     * @param widgetEventMaps - business-logic–derived widget→EventContext maps
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

    /**
     * @returns the assembled navigation multigraph
     */
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
     * Register every NgModule node, plus its “imports” & “declares” edges.
     *
     * @param moduleRegistry - all NgModule metadata
     * @param componentRegistry - all ComponentInfo metadata
     */
    private _registerModules(
        moduleRegistry: ModuleRegistry,
        componentRegistry: ComponentRegistry
    ): void {
        for (const mod of moduleRegistry.modules) {
            // registers module node in the graph
            this._addNode(mod.name, "module", { attributes: { role: mod.role } });

            // module → declares → component
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
     * Register every route node and link its declaring module → route.
     *
     * @param compRouteMap - raw routes + roles
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
                this._addStaticEdge(compR.module, compR.route);
        }
    }

    /**
     * Register every component (with role), its nested‐component edges,
     * and the entire widget subtrees.
     *
     * @param compRouteMap - raw routes + roles
     * @param componentRegistry - all ComponentInfo metadata
     */
    private _registerComponents(
        compRouteMap: ComponentRouteMap,
        componentRegistry: ComponentRegistry
    ): void {
        for (const ci of componentRegistry.components) {
            const role = this._lookupComponentRole(ci.selector, compRouteMap.roles);
            // registers component node in the graph
            this._addNode(ci.selector, "component", { attributes: { role } });

            // route → component
            for (const path of RoutingUtils.getRoutesFromSelector(ci.selector, compRouteMap.routeMap))
                this._addStaticEdge(path, ci.selector);

            // component → nested-component
            for (const child of ci.nestedComponents) {
                this._addNode(child, "component");
                this._addStaticEdge(ci.selector, child);
            }

            // component → widgets & nested-widgets
            for (const w of ci.widgets)
                this._registerWidgets(w, ci.selector);
        }
    }

    /**
     * Recursively register a widget and any nested widgets.
     *
     * @param widget - widget metadata
     * @param parentId - ID of the containing component/widget
     */
    private _registerWidgets(
        widget: WidgetInfo,
        parentId: string
    ): void {
        // compute the *effective* widget‐type once
        const effectiveType = WidgetUtils.wType(widget);
        // merge in original attrs + our effective widgetType
        const metaAttrs = {
            ...widget.attributes,
            events: widget.events,
            widgetType: effectiveType
        };

        // 1) register this widget as a node
        this._addNode(widget.id, "widget", {
            attributes: metaAttrs,
            validationRules: widget.validationRules,
            triggersFormSubmission: widget.triggersFormSubmission,
        });

        // 2) connect it to its parent (component or parent widget)
        this._addStaticEdge(parentId, widget.id);

        // 3) dive into any nested widgets
        for (const child of widget.children || [])
            this._registerWidgets(child, widget.id);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS: DYNAMIC GRAPH
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Emit `lazy-load` transitions for every `loadChildren` route.
     * Creates an edge from the **declaring** module → each **target** module.
     *
     * @param compRouteMap - raw routes + roles
     * @param moduleRegistry - all NgModule metadata
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
     * Emit `static-redirect` transitions for every redirect‐only route.
     *
     * @param compRouteMap - raw routes + roles
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
    *  1) skip empty targets
    *  2) href → external-route
    *  3) routerLink → route (canonicalized) or external-route, else virtual-route
    *  4) router.navigate/navigateByUrl → route (canonicalized)
    *  5) backend (service/http) → virtual-route under /backend (per config)
    *  6) remaining → literal route if known, else virtual-route
     *
     * @param compRouteMap - raw routes + roles
     * @param widgetEventMaps - business-logic maps
     */
    private _registerWidgetTransitions(
        compRouteMap: ComponentRouteMap,
        widgetEventMaps: WidgetEventMap[]
    ): void {
        const knownRoutes = new Set(compRouteMap.routeMap.routes.map(r => r.route));

        // small local helper
        const ensureLeadingSlash = (s: string) => (s.startsWith('/') ? s : `/${s}`);

        for (const wem of widgetEventMaps) {
            for (const ev of wem.eventContexts) {
                // Accumulate per event
                const navTargets = new Set<string>();            // routes only
                const backendCalls = new Map<string, { service: string; method: string }>(); // key=service.method
                const uiEffects: string[] = [];                  // kept in metadata only

                for (const call of ev.callContexts) {
                    const called = String(call.called || '').trim();
                    // 1) skip empty targets
                    if (!called) continue;

                    // 2) href → external-route (absolute URLs or any href literal)
                    if (ev.event === 'href') {
                        this._addNode(called, 'external-route');
                        this._addDynamicTransition(wem.widgetID, called, ev.event, { params: call.data, handler: ev.handler });
                        continue;
                    }

                    // 3) routerLink → canonical route / external / virtual
                    if (ev.event === 'routerLink') {
                        const canonical = RoutingUtils.canonicalizeToKnownRoute(ensureLeadingSlash(called), knownRoutes);
                        if (knownRoutes.has(canonical)) navTargets.add(canonical);
                        continue;
                    }

                    // 4) router.navigate/navigateByUrl([...]) → route
                    const isNav = LogicUtils.isRouterNavigateCall(`${call.caller}.${call.called}`)
                        && Array.isArray(call.data) && call.data.length;

                    if (isNav) {
                        const raw = ensureLeadingSlash(call.data.join('/'));
                        const canonical = RoutingUtils.canonicalizeToKnownRoute(raw, knownRoutes);
                        if (knownRoutes.has(canonical)) navTargets.add(canonical);
                        continue;
                    }

                    // 5) backend (sentinel or caller heuristic) → virtual-route under /backend
                    const isBackend = (Array.isArray(call.data) && call.data[0] === '/backend')
                        || LogicUtils.isBackendServiceCaller(call.caller, this.cfg);

                    if (isBackend) {
                        // skip noisy calls
                        if (this.cfg.noise.methodNames.has(call.called)) continue;


                        const rawService =
                            (Array.isArray(call.data) && call.data[1]) ||
                            call.caller.replace(/^this\./, '').split('.')[0];
                        const service = this.cfg.backend.normalizeServiceName(rawService);
                        const method = (Array.isArray(call.data) && call.data[2]) || call.called || 'call';
                        backendCalls.set(`${service}.${method}`, { service, method });
                        continue;
                    }

                    // 6) Everything else is a UI-only effect → keep off the graph
                    uiEffects.push(called);
                }

                // 1) route nav (at most one)
                const nav = Array.from(navTargets).sort()[0];
                if (nav) {
                    this._addNode(nav, 'route');
                    this._addDynamicTransition(wem.widgetID, nav, ev.event, { handler: ev.handler, uiEffects });
                }

                // 2) backend calls
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

                // 3) UI-only effects → emit *virtual* target
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
    * For each widget that *triggers* form submission (e.g. <button type="submit">),
    * add exactly one dynamic transition to its nearest ancestor <form>:
    *
    *   (submit-trigger widget) --submit--> (form widget)
    *
    * The form itself remains the only node that has submit→route/backend transitions.
    * No field-level input/change duplication is added.
    */

    private _registerFormFieldTransitions(): void {
        for (const node of this.nodes.values()) {
            if (node.type !== 'widget') continue;

            // const wt = (node.attributes?.widgetType as string) || '';
            const isSubmitTrigger =
                node.triggersFormSubmission === true;

            if (!isSubmitTrigger) continue;

            const formId = this._findNearestAncestorForm(node.id);
            if (!formId) continue;

            // Single edge from the trigger to the form, typed as 'submit'.
            // Keep the original source event in metadata for traceability.
            this._addDynamicTransition(node.id, formId, 'submit', { sourceEvent: 'click' });
        }

    }

    /**
    * Walks static 'contains' edges upward to find the nearest ancestor <form> widget.
    */
    private _findNearestAncestorForm(startId: string): string | undefined {
        let cur = startId;

        // Look up the parent by scanning static 'contains' edges (to = cur).
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
     * Add a node if missing.
     *
     * @param rawId   The raw identifier (route, selector, widget ID, URL).
     * @param type    Semantic node type.
     * @param partial Optional extra fields (attributes, validationRules, etc.).
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
     * Add a static edge if it doesn’t already exist.
     *
     * @param from Source node ID.
     * @param to   Destination node ID.
     * @param type Relation type (default "contains").
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
     * Add a dynamic transition if missing.
     *
     * @param from     Widget or route node ID.
     * @param to       Target node ID.
     * @param type     Event or nav relation type.
     * @param metadata Optional metadata (e.g. route params).
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
     * Determine a component’s role classification based on the ComponentRouteMap.
     *
     * @param selector
     *   The kebab-case component selector (e.g. `'app-header'`).
     * @param roles
     *   A record mapping each ComponentRouteRole (`root`, `global`, `shared`, `mapped`, `dead`)
     *   to the array of ComponentInfo objects in that role.
     * @returns
     *   The ComponentRouteRole assigned to the component whose selector was provided.
     */
    private _lookupComponentRole(
        selector: string,
        roles: Record<ComponentRouteRole, ComponentInfo[]>
    ): ComponentRouteRole {
        if (roles.dead.some(c => c.selector === selector)) return 'dead';
        if (roles.global.some(c => c.selector === selector)) return 'global';
        if (roles.shared.some(c => c.selector === selector)) return 'shared';
        if (roles.mapped.some(c => c.selector === selector)) return 'mapped';
        return 'mapped';  // default
    }

    /** helper: walk static 'contains' edges to collect all descendants of a node */
    private _collectDescendants(rootId: string): string[] {
        const out: string[] = [];
        const stack = [rootId];
        while (stack.length) {
            const cur = stack.pop()!;
            for (const e of this.edges) {
                if (e.from === cur && e.type === 'contains') {
                    out.push(e.to);
                    stack.push(e.to);
                }
            }
        }
        return out;
    }

    /**
     * Normalize an identifier by collapsing multiple consecutive slashes,
     * while preserving full URLs intact.
     *
     * @param id
     *   The raw identifier string (route path, widget ID, URL, etc.).
     * @returns
     *   A normalized identifier with no duplicate slashes (except in HTTP/HTTPS URLs).
     */
    private _normalizeId(id: string): string {
        // preserve full URLs
        if (/https?:\/\//i.test(id))
            return id;
        return id.replace(/\/{2,}/g, '/');
    }
}