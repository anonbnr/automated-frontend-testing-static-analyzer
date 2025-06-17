// ──────────────────────────────────────────────────────────────────────────────
// static-analyzer.ts
//
// Coordinates the end-to-end static analysis of an Angular workspace to produce
// an `AppNavigation` multigraph. It:
//   1. Discovers every component + its template → ComponentRegistry
//   2. Analyzes all routes & redirects            → RouteMap
//   3. Builds static “contains” edges (and tags each component with its role): route → component → nested component/widget
//   4. Runs business-logic analysis to extract widget-event call-graphs
//   5. Builds dynamic transitions: widget events → routes / virtual targets
//
// Delegates work to:
//   - `ComponentRegistryBuilder`
//   - `RouteAnalyzer`
//   - `LogicAnalyzer`
//   - `NavigationGraphBuilder`
// ──────────────────────────────────────────────────────────────────────────────

import { Project } from "ts-morph";
import { LogicAnalyzer } from '../analyzers/business-logic/logic-analyzer.js';
import { RouteAnalyzer } from "../analyzers/routes/route-analyzer.js";
import { ComponentRegistryBuilder } from "../builders/component-registry-builder.js";
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { ComponentRegistry } from "../models/component-info.js";
import { AppNavigation } from "../models/navigation-graph.js";
import { ComponentRouteMap } from "../models/route-info.js";

/**
 * The `StaticAnalyzer` orchestrates construction of the full navigation graph
 * for an Angular application. It drives the pipeline:
 *  1) Component discovery via `ComponentRegistryBuilder`
 *  2) Route analysis via `RouteAnalyzer`
 *  3) Static graph assembly via `NavigationGraphBuilder.buildStatic*`
 *  4) Dynamic transition extraction via `LogicAnalyzer`
 *  5) Dynamic graph assembly via `NavigationGraphBuilder.buildDynamic`
 *
 * Usage:
 * ```ts
 * const analyzer = new StaticAnalyzer("/path/to/tsconfig.json");
 * const navigation: AppNavigation = await analyzer.analyze();
 * ```
 */
export class StaticAnalyzer {
    private project: Project;
    private registry!: ComponentRegistry;
    private compRouteMap!: ComponentRouteMap;
    private routeAnalyzer: RouteAnalyzer;
    private logicAnalyzer: LogicAnalyzer = new LogicAnalyzer();
    private graphBuilder: NavigationGraphBuilder = new NavigationGraphBuilder();

    /**
     * Initializes the static analyzer with the specified TypeScript configuration file.
     * @param tsConfigPath Absolute path to the Angular project's `tsconfig.json`
     */
    constructor(tsConfigPath: string) {
        this.project = new Project({ tsConfigFilePath: tsConfigPath });
        this.routeAnalyzer = new RouteAnalyzer(this.project);
    }

    /**
     * Runs the full static-analysis pipeline and returns the assembled navigation graph.
     *
     * Steps:
     *   1) Component discovery via ComponentRegistryBuilder
     *   2) Route analysis via RouteAnalyzer (dedupe + reachability-based roles)
     *   3) Static graph assembly (buildStatic): 
     *      - registers routes, components (with root/global/shared/mapped/dead roles), nested components & widgets
     *      - wires up “contains” edges
     *   4) Business-logic analysis via LogicAnalyzer (widget → call graph)
     *   5) Dynamic graph assembly (buildDynamic): 
     *      - static-redirect edges
     *      - event-driven transitions (routerLink, click, submit, virtual routes)
     *
     * @returns A promise resolving to an AppNavigation containing:
     *   - nodes: all route, component, widget, and virtual-route nodes
     *   - edges: all static “contains” relationships
     *   - transitions: all dynamic event-driven transitions
     */
    async analyze(): Promise<AppNavigation> {
        // ── PHASE 1: COMPONENT DISCOVERY ─────────────────────────────────────────────
        // Extracts every @Component, loads its template, parses widgets & nested selectors.
        this.registry = await new ComponentRegistryBuilder(this.project).buildComponentsRegistry();

        // ── PHASE 2: ROUTE ANALYSIS ─────────────────────────────────────────────────
        // Scans all routing modules, dedupes, and computes shared/global component sets.
        this.compRouteMap = await this.routeAnalyzer.analyzeProject(this.registry);

        // ── PHASE 3: STATIC GRAPH CONSTRUCTION ──────────────────────────────────────
        this.graphBuilder.buildStatic(this.compRouteMap, this.registry);

        // ── PHASE 4: DYNAMIC GRAPH CONSTRUCTION ─────────────────────────────────────
        const widgetEventMaps = this.logicAnalyzer.analyzeProject(this.project, this.registry, this.compRouteMap.routeMap);
        this.graphBuilder.buildDynamic(this.compRouteMap.routeMap, this.registry.components, widgetEventMaps);

        // ── PHASE 5: GRAPH CONSTRUCTED ─────────────────────────────────────
        return this.graphBuilder.getGraph();
    }
}