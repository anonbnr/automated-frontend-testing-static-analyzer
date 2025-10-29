// ──────────────────────────────────────────────────────────────────────────────
// orchestrators/static-analyzer.ts
//
// Orchestrates a five-phase static analysis of an Angular workspace to produce
// an `AppNavigation` multigraph.
//
// Pipeline (in order):
//   1) Module discovery (NgModules)                                  → ModuleRegistry
//   2) Component discovery (templates → widgets & nested selectors)  → ComponentRegistry
//   3) Route analysis & module assignment (routes, redirects, roles) → ComponentRouteMap (+ route.module)
//   4) Static graph construction (contains/imports/declares edges)   → Graph nodes/edges
//   5) Dynamic graph construction (lazy-load, redirects, widget events) → Graph transitions
//
// Delegates to:
//   - ModuleRegistryBuilder
//   - ComponentRegistryBuilder
//   - RouteAnalyzer
//   - LogicAnalyzer
//   - NavigationGraphBuilder
//
// Notes:
//   • This is the *high-level* coordinator; individual builders/analyzers own parsing details.
//   • A single `Project` is created from the provided tsconfig; it is reused across all phases.
//   • The same AnalyzerConfig instance is passed to Logic/Graph builders for consistent behavior.
//   • Accessors (`project`, `compRegistry`, `modRegistry`, `compRouteMap`) expose intermediate artifacts.
// ──────────────────────────────────────────────────────────────────────────────

import { Project } from "ts-morph";
import { LogicAnalyzer } from '../analyzers/business-logic/logic-analyzer.js';
import { RouteAnalyzer } from "../analyzers/routes/route-analyzer.js";
import { ComponentRegistryBuilder } from "../builders/component-registry-builder.js";
import { ModuleRegistryBuilder } from "../builders/module-registry-builder.js";
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from "../models/analyzer-config.js";
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
    /** Shared ts-morph project for the entire pipeline. */
    private _project: Project;

    /** Analyzer configuration used by downstream analyzers/builders. */
    private cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG

    /** Intermediate: all discovered components (templates parsed). */
    private _compRegistry!: ComponentRegistry;

    /** Intermediate: all discovered modules (roles/flags set). */
    private _modRegistry!: ModuleRegistry;

    /** Intermediate: routes + redirects + component roles (with route.module). */
    private _compRouteMap!: ComponentRouteMap;

    /** Route analyzer (reused across runs). */
    private _routeAnalyzer: RouteAnalyzer;

    /** Business-logic analyzer (widgets → events → call contexts). */
    private _logicAnalyzer: LogicAnalyzer = new LogicAnalyzer(this.cfg);

    /** Graph builder (static + dynamic) using the same config. */
    private _graphBuilder: NavigationGraphBuilder = new NavigationGraphBuilder(this.cfg);

    /**
     * @param tsConfigPath Absolute path to the Angular project's `tsconfig.json`.
     *                     The ts-morph Project is created from this file.
     */
    constructor(tsConfigPath: string) {
        this._project = new Project({ tsConfigFilePath: tsConfigPath });
        this._routeAnalyzer = new RouteAnalyzer(this._project);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Runs the five-phase static analysis pipeline and returns the assembled
     * `AppNavigation` multigraph.
     *
     * Phases:
     *   1. Module discovery
     *   2. Component discovery
     *   3. Route analysis & module assignment
     *   4. Static graph construction
     *   5. Dynamic graph construction
     *
     * Side effects:
     *   - Populates internal `_compRegistry`, `_modRegistry`, `_compRouteMap`.
     *
     * @returns Promise resolving to the complete `AppNavigation` multigraph.
     */
    async analyze(): Promise<AppNavigation> {
        // ── PHASE 1: MODULE DISCOVERY ───────────────────────────────────────────
        // Walk all @NgModule declarations and classify (root/routing/external/shared/global).
        const modBuilder = new ModuleRegistryBuilder(this._project);
        await modBuilder.discoverModules();

        // ── PHASE 2: COMPONENT DISCOVERY ───────────────────────────────────────
        // Extract every @Component, load template (inline or via templateUrl),
        // parse widgets & nested selectors → ComponentRegistry.
        this._compRegistry = await new ComponentRegistryBuilder(this._project).buildComponentsRegistry();

        // ── PHASE 3: ROUTE ANALYSIS & MODULE ASSIGNMENT ────────────────────────
        // Parse routing configs, normalize/dedupe, compute usage & roles → ComponentRouteMap.
        // Then assign declaring modules to routes (eager & lazy) and mark lazy modules.
        this._compRouteMap = await this._routeAnalyzer.analyzeProject(this._compRegistry);
        modBuilder.assignRoutesToModules(this._compRouteMap);
        this._modRegistry = modBuilder.registry;

        // ── PHASE 4: STATIC GRAPH CONSTRUCTION ─────────────────────────────────
        // Emit nodes (modules/routes/components/widgets) and static edges
        // (imports/declares/contains, plus route containment).
        this._graphBuilder.buildStatic(this._compRouteMap, this._modRegistry, this._compRegistry);

        // ── PHASE 5: DYNAMIC GRAPH CONSTRUCTION ────────────────────────────────
        // Analyze widget events → EventContexts, then emit dynamic transitions:
        // lazy-load, static-redirect, routerLink/navigate/href, backend service-calls, UI effects.
        const widgetEventMaps = this._logicAnalyzer.analyzeProject(this._project, this._compRegistry, this._compRouteMap.routeMap);
        this._graphBuilder.buildDynamic(this._compRouteMap, this._modRegistry, widgetEventMaps);

        // ── DONE ───────────────────────────────────────────────────────────────
        return this._graphBuilder.getGraph();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // READ-ONLY ACCESSORS (Expose pipeline artifacts to callers)
    // ──────────────────────────────────────────────────────────────────────────

    /** The shared ts-morph Project created from the provided tsconfig. */
    get project(): Project {
        return this._project;
    }

    /** The populated ComponentRegistry (after Phase 2). */
    get compRegistry(): ComponentRegistry {
        return this._compRegistry;
    }

    /** The populated ModuleRegistry (after Phases 1 & 3). */
    get modRegistry(): ModuleRegistry {
        return this._modRegistry;
    }

    /** The computed ComponentRouteMap (normalized routes, redirects, roles). */
    get compRouteMap(): ComponentRouteMap {
        return this._compRouteMap;
    }
}