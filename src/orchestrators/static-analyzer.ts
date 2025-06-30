// ──────────────────────────────────────────────────────────────────────────────
// orchestrators/static-analyzer.ts
//
// Orchestrates a five-phase static analysis of an Angular workspace to produce
// an `AppNavigation` multigraph.
//
// Pipeline:
//   1. Module discovery (NgModules)  
//   2. Component discovery (templates → widgets & nested selectors)  
//   3. Route analysis & module assignment (routes, redirects, component roles)  
//   4. Static graph construction (contains/imports/declares edges)  
//   5. Dynamic graph construction (lazy-load, redirects, widget events)
//
// Delegates to:
//   - ModuleRegistryBuilder
//   - ComponentRegistryBuilder
//   - RouteAnalyzer
//   - LogicAnalyzer
//   - NavigationGraphBuilder
// ──────────────────────────────────────────────────────────────────────────────

import { Project } from "ts-morph";
import { LogicAnalyzer } from '../analyzers/business-logic/logic-analyzer.js';
import { RouteAnalyzer } from "../analyzers/routes/route-analyzer.js";
import { ComponentRegistryBuilder } from "../builders/component-registry-builder.js";
import { ModuleRegistryBuilder } from "../builders/module-registry-builder.js";
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { ComponentRegistry } from "../models/component-info.js";
import { ModuleRegistry } from "../models/module-info.js";
import { AppNavigation } from "../models/navigation-graph.js";
import { ComponentRouteMap } from "../models/route-info.js";

/**
 * StaticAnalyzer
 *
 * Drives the full, five-phase analysis pipeline for an Angular app:
 *
 *   1. Module discovery via ModuleRegistryBuilder  
 *   2. Component discovery via ComponentRegistryBuilder  
 *   3. Route analysis & module assignment via RouteAnalyzer  
 *   4. Static graph construction via NavigationGraphBuilder.buildStatic  
 *   5. Dynamic graph construction via LogicAnalyzer + NavigationGraphBuilder.buildDynamic
 *
 * @example
 * ```ts
 * const analyzer = new StaticAnalyzer("/path/to/tsconfig.json");
 * const navGraph = await analyzer.analyze();
 * ```
 */
export class StaticAnalyzer {
    private project: Project;
    private compRegistry!: ComponentRegistry;
    private modRegistry!: ModuleRegistry;
    private compRouteMap!: ComponentRouteMap;
    private routeAnalyzer: RouteAnalyzer;
    private logicAnalyzer: LogicAnalyzer = new LogicAnalyzer();
    private graphBuilder: NavigationGraphBuilder = new NavigationGraphBuilder();

    /**
     * @param tsConfigPath
     *   Absolute path to the Angular project's `tsconfig.json`.
     */
    constructor(tsConfigPath: string) {
        this.project = new Project({ tsConfigFilePath: tsConfigPath });
        this.routeAnalyzer = new RouteAnalyzer(this.project);
    }

    /**
     * Runs the five-phase analysis pipeline and returns the assembled navigation graph.
     *
     * Phases:
     *   1. Module discovery  
     *   2. Component discovery  
     *   3. Route analysis & module assignment  
     *   4. Static graph construction  
     *   5. Dynamic graph construction
     *
     * @returns Promise resolving to the complete `AppNavigation` multigraph.
     */
    async analyze(): Promise<AppNavigation> {
        // ── PHASE 1: MODULE DISCOVERY ────────────────────────────────
        const modBuilder = new ModuleRegistryBuilder(this.project);
        await modBuilder.discoverModules();

        // ── PHASE 2: COMPONENT DISCOVERY ─────────────────────────────────────────────
        // Extracts every @Component, loads its template, parses widgets & nested selectors.
        this.compRegistry = await new ComponentRegistryBuilder(this.project).buildComponentsRegistry();

        // ── PHASE 3: ROUTE ANALYSIS & MODULE ASSIGNMENT ─────────
        this.compRouteMap = await this.routeAnalyzer.analyzeProject(this.compRegistry);
        modBuilder.assignRoutesToModules(this.compRouteMap);
        this.modRegistry = modBuilder.registry;

        // ── PHASE 4: STATIC GRAPH CONSTRUCTION ──────────────────
        this.graphBuilder.buildStatic(this.compRouteMap, this.modRegistry, this.compRegistry);

        // ── PHASE 5: DYNAMIC GRAPH CONSTRUCTION ─────────────────
        const widgetEventMaps = this.logicAnalyzer.analyzeProject(this.project, this.compRegistry, this.compRouteMap.routeMap);
        this.graphBuilder.buildDynamic(this.compRouteMap, this.modRegistry, widgetEventMaps);

        // ── DONE ────────────────────────────────────────────────
        return this.graphBuilder.getGraph();
    }
}