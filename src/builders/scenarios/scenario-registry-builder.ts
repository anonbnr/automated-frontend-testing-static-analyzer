// src/builders/scenarios/scenario-registry-builder.ts
/**
 * 
 * ScenarioRegistryBuilder
 * =======================
 * Builds **raw** scenarios (S = sequence of steps) from the navigation multigraph.
 *
 * Key properties of the output:
 * - **Staged interactions**: every widget along a path may contribute an `interaction`
 *   (e.g., input/change/click) and, if applicable, a non-terminal effect step
 *   (`virtual-route` or `backend`) before the final terminal step.
 * - **Submit chains**: if a submit-trigger widget has a `submit` → (form widget) transition,
 *   terminal outcomes are collected from the **form widget** (not the button).
 * - **Terminal kinds**: terminal outcomes can be one of
 *   `route | external-route | backend | virtual-route`.
 *   We emit **one scenario per terminal outcome**, so the pre-processor can group siblings.
 * - **Intent**: assigned with `deriveScenarioIntent`, so non-route terminals are labelled well.
 */

import logger from "../../logging/logger.js";
import { AppNavigation, GraphTransition } from "../../models/navigation-graph.js";
import { ComponentRouteMap } from "../../models/route-info.js";
import { Scenario, ScenarioRegistry, ScenarioStep } from "../../models/scenarios/scenario-info.js";
import { GraphLookups } from "./graph-helpers.js";
import { deriveScenarioIntent } from "./intent-labels.js";
import { DefaultIntentResolver, IntentResolver } from "./intent-resolver.js";
import { validateScenarioArtifacts } from "./scenario-artifact-validator.js";
import { ScenarioAssembler } from "./scenario-assembler.js";
import { FanoutMode, ScenarioPostProcessor, ScenarioPreProcessor } from "./scenario-processors.js";

export class ScenarioRegistryBuilder {
    private intentResolver: IntentResolver;
    private g!: GraphLookups;
    private asm!: ScenarioAssembler;

    /**
    * @param compRouteMap  Raw routes + roles used by the intent resolver.
    * @param nav           Full navigation multigraph (nodes/edges/transitions).
    * @param fanoutMode    Pre-processor fanout behavior ("primary" | "collapse").
    */
    constructor(
        private compRouteMap: ComponentRouteMap,
        private nav: AppNavigation,
        private fanoutMode: FanoutMode = "primary" // default
    ) {
        this.intentResolver = new DefaultIntentResolver(this.compRouteMap.routeMap);
    }

    /**
    * Pipeline
    * --------
    * 1) Initialize graph helpers (GraphLookups, ScenarioAssembler).
    * 2) Collect raw scenarios from:
    *    - module→route→component→widgets (route-scoped)
    *    - app-root→component→widgets (global)
    *    - route→(route|external) (route→route/href/redirect)
    * 3) Pre-process (fanout grouping).
    * 4) Post-process (success).
    * 5) Intent derivation (route label or non-route label).
    */
    build(): ScenarioRegistry {
        // 1) lookups
        this.g = new GraphLookups(this.nav);
        this.asm = new ScenarioAssembler(this.g);

        logger.info(
            "[ScenarioBuilder] Starting build: nodes=%d edges=%d transitions=%d",
            this.nav.nodes.length, this.nav.edges.length, this.nav.transitions.length
        );

        // 2) raw scenarios
        const routeScoped = this._collectRouteScoped();
        const globalHeader = this._collectGlobal();
        const routeToRoute = this._collectRouteToRoute();
        const raw = [...routeScoped, ...globalHeader, ...routeToRoute];

        logger.debug(
            "[ScenarioBuilder] Raw: routeScoped=%d, global=%d, routeToRoute=%d, total=%d",
            routeScoped.length, globalHeader.length, routeToRoute.length, raw.length
        );

        // 3) pre-process
        const finalList = new ScenarioPreProcessor().process(raw, this.fanoutMode);
        logger.info(
            "[ScenarioBuilder] After pre-process (fanout=%s): scenarios=%d",
            this.fanoutMode, finalList.length
        );

        // 🔎 Validate scenarios vs graph
        validateScenarioArtifacts(this.nav, finalList);

        const registry = new ScenarioRegistry();
        for (const scenario of finalList) {
            // 4) post-processing (success computing)
            scenario.success = new ScenarioPostProcessor(scenario.steps).computeSuccess();
            // 5) intent derivation
            scenario.intent = deriveScenarioIntent(scenario, this.intentResolver);
            registry.add(scenario);
        }

        logger.info("[ScenarioBuilder] Done: scenarios=%d", registry.size());
        return registry;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Collectors
    // ────────────────────────────────────────────────────────────────────────────
    /**
    * Route-scoped collector:
    * module → route → component → (widget₁ → interaction? → effect?) … → (terminal)
    * Emits one scenario per terminal outcome.
    */
    private _collectRouteScoped(): Scenario[] {
        const out: Scenario[] = [];

        for (const moduleNode of this.nav.nodes.filter(n => n.type === "module")) {
            const moduleId = moduleNode.id;

            for (const routeId of this.g.containsMap.get(moduleId) ?? []) {
                const routeNode = this.g.nodeMap.get(routeId);
                if (!routeNode || routeNode.type !== "route") continue;

                const widgetPaths = this.g.findWidgetPaths(routeId, null);
                for (const { componentId, widgetPath } of widgetPaths) {
                    const prefix: ScenarioStep[] = [
                        { stepType: "module", nodeId: moduleId },
                        { stepType: "route", nodeId: routeId },
                        { stepType: "component", nodeId: componentId },
                    ];

                    out.push(
                        ...this.asm.assemble({
                            prefixSteps: prefix,
                            widgetPath,
                            rootModuleId: moduleId,
                        })
                    );
                }
            }
        }
        return out;
    }

    /** Global header collector under \<app-root\>:
     *  module → app-root → component → widget-path → terminals
     * */
    private _collectGlobal(): Scenario[] {
        const out: Scenario[] = [];
        if (!this.g.nodeMap.has("app-root")) return out;

        const globalPaths = this.g.findWidgetPaths("app-root", null);
        for (const { componentId, widgetPath } of globalPaths) {
            const prefix: ScenarioStep[] = [
                { stepType: "module", nodeId: this.g.rootModuleId },
                { stepType: "component", nodeId: "app-root" },
                { stepType: "component", nodeId: componentId },
            ];
            out.push(
                ...this.asm.assemble({
                    prefixSteps: prefix,
                    widgetPath,
                    rootModuleId: this.g.rootModuleId,
                })
            );
        }
        return out;
    }

    /** 
     * Route-to-Route Collector:
     * route→route / route→external transitions
     * (routerLink|href|static-redirect).
     */
    private _collectRouteToRoute(): Scenario[] {
        const out: Scenario[] = [];

        for (const t of this.nav.transitions as GraphTransition[]) {
            if (!["static-redirect", "routerLink", "href"].includes(t.type)) continue;

            const fromNode = this.g.nodeMap.get(t.from);
            const dest = this.g.nodeMap.get(t.to);
            if (!fromNode || fromNode.type !== "route") continue;
            if (!dest || (dest.type !== "route" && dest.type !== "external-route")) continue;

            const steps: ScenarioStep[] = [
                { stepType: "module", nodeId: this.g.rootModuleId },
                { stepType: "route", nodeId: t.from },
                { stepType: "interaction", nodeId: t.from, via: t.type, metadata: t.metadata },
                { stepType: dest.type, nodeId: t.to, metadata: t.metadata } as ScenarioStep,
            ];

            const scenarioId = [
                this.g.rootModuleId,
                `${t.from}[${t.type}]`,
                t.to,
            ].join("→");

            out.push({ rootModule: this.g.rootModuleId, id: scenarioId, steps });
        }

        return out;
    }
}