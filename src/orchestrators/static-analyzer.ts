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
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from "../models/analyzer-config.js";

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
    private _project: Project;
    private cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG
    private _compRegistry!: ComponentRegistry;
    private _modRegistry!: ModuleRegistry;
    private _compRouteMap!: ComponentRouteMap;
    private _routeAnalyzer: RouteAnalyzer;
    private _logicAnalyzer: LogicAnalyzer = new LogicAnalyzer(this.cfg);
    private _graphBuilder: NavigationGraphBuilder = new NavigationGraphBuilder(this.cfg);

    /**
     * @param tsConfigPath
     *   Absolute path to the Angular project's `tsconfig.json`.
     */
    constructor(tsConfigPath: string) {
        this._project = new Project({ tsConfigFilePath: tsConfigPath });
        this._routeAnalyzer = new RouteAnalyzer(this._project);
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
        const modBuilder = new ModuleRegistryBuilder(this._project);
        await modBuilder.discoverModules();

        // ── PHASE 2: COMPONENT DISCOVERY ─────────────────────────────────────────────
        // Extracts every @Component, loads its template, parses widgets & nested selectors.
        this._compRegistry = await new ComponentRegistryBuilder(this._project).buildComponentsRegistry();

        // ── PHASE 3: ROUTE ANALYSIS & MODULE ASSIGNMENT ─────────
        this._compRouteMap = await this._routeAnalyzer.analyzeProject(this._compRegistry);
        modBuilder.assignRoutesToModules(this._compRouteMap);
        this._modRegistry = modBuilder.registry;

        // ── PHASE 4: STATIC GRAPH CONSTRUCTION ──────────────────
        this._graphBuilder.buildStatic(this._compRouteMap, this._modRegistry, this._compRegistry);

        // ── PHASE 5: DYNAMIC GRAPH CONSTRUCTION ─────────────────
        const widgetEventMaps = this._logicAnalyzer.analyzeProject(this._project, this._compRegistry, this._compRouteMap.routeMap);
        this._graphBuilder.buildDynamic(this._compRouteMap, this._modRegistry, widgetEventMaps);

        // ── DONE ────────────────────────────────────────────────
        return this._graphBuilder.getGraph();
    }

    get project(): Project {
        return this._project;
    }

    get compRegistry(): ComponentRegistry {
        return this._compRegistry;
    }

    get modRegistry(): ModuleRegistry {
        return this._modRegistry;
    }

    get compRouteMap(): ComponentRouteMap {
        return this._compRouteMap;
    }
}