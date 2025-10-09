// builders/user-journeys/user-journey-registry-builder.ts
/**
 * 
 * UserJourneyRegistryBuilder
 * =======================
 * Builds **raw** user journeys (S = sequence of steps) from the navigation multigraph.
 *
 * Key properties of the output:
 * - **Staged interactions**: every widget along a path may contribute an `interaction`
 *   (e.g., input/change/click) and, if applicable, a non-terminal effect step
 *   (`virtual-route` or `backend`) before the final terminal step.
 * - **Submit chains**: if a submit-trigger widget has a `submit` → (form widget) transition,
 *   terminal outcomes are collected from the **form widget** (not the button).
 * - **Terminal kinds**: terminal outcomes can be one of
 *   `route | external-route | backend | virtual-route`.
 *   We emit **one user journey per terminal outcome**, so the pre-processor can group siblings.
 * - **Intent**: assigned with `deriveUserJourneyIntent`, so non-route terminals are labelled well.
 */

import logger from "../../logging/logger.js";
import { AppNavigation, GraphTransition } from "../../models/navigation-graph.js";
import { ComponentRouteMap } from "../../models/route-info.js";
import { UserJourney, UserJourneyRegistry, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { GraphLookups } from "./graph-helpers.js";
import { deriveUserJourneyIntent } from "./intent-labels.js";
import { DefaultIntentResolver, IntentResolver } from "./intent-resolver.js";
import { validateUserJourneyArtifacts } from "./user-journey-artifact-validator.js";
import { UserJourneyAssembler } from "./user-journey-assembler.js";
import { FanoutMode, UserJourneyPostProcessor, UserJourneyPreProcessor } from "./user-journey-processors.js";

export class UserJourneyRegistryBuilder {
    private intentResolver: IntentResolver;
    private g!: GraphLookups;
    private asm!: UserJourneyAssembler;

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
    * 1) Initialize graph helpers (GraphLookups, UserJourneyAssembler).
    * 2) Collect raw user journeys from:
    *    - module→route→component→widgets (route-scoped)
    *    - app-root→component→widgets (global)
    *    - route→(route|external) (route→route/href/redirect)
    * 3) Pre-process (fanout grouping).
    * 4) Post-process (success).
    * 5) Intent derivation (route label or non-route label).
    */
    build(): UserJourneyRegistry {
        // 1) lookups
        this.g = new GraphLookups(this.nav);
        this.asm = new UserJourneyAssembler(this.g);

        logger.info(
            "[UserJourneyRegistryBuilder] Starting build: nodes=%d edges=%d transitions=%d",
            this.nav.nodes.length, this.nav.edges.length, this.nav.transitions.length
        );

        // 2) raw user journeys
        const routeScoped = this._collectRouteScoped();
        const globalHeader = this._collectGlobal();
        const routeToRoute = this._collectRouteToRoute();
        const raw = [...routeScoped, ...globalHeader, ...routeToRoute];

        logger.debug(
            "[UserJourneyRegistryBuilder] Raw: routeScoped=%d, global=%d, routeToRoute=%d, total=%d",
            routeScoped.length, globalHeader.length, routeToRoute.length, raw.length
        );

        // 3) pre-process
        const finalList = new UserJourneyPreProcessor().process(raw, this.fanoutMode);
        logger.info(
            "[UserJourneyRegistryBuilder] After pre-process (fanout=%s): journeys=%d",
            this.fanoutMode, finalList.length
        );

        // 🔎 Validate user journeys vs graph
        validateUserJourneyArtifacts(this.nav, finalList);

        const registry = new UserJourneyRegistry();
        for (const j of finalList) {
            // 4) post-processing (success computing)
            j.success = new UserJourneyPostProcessor(j.steps).computeSuccess();
            // 5) intent derivation
            j.intent = deriveUserJourneyIntent(j, this.intentResolver);
            registry.add(j);
        }

        logger.info("[UserJourneyRegistryBuilder] Done: journeys=%d", registry.size());
        return registry;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Collectors
    // ────────────────────────────────────────────────────────────────────────────
    /**
    * Route-scoped collector:
    * module → route → component → (widget₁ → interaction? → effect?) … → (terminal)
    * Emits one user journey per terminal outcome.
    */
    private _collectRouteScoped(): UserJourney[] {
        const out: UserJourney[] = [];

        for (const moduleNode of this.nav.nodes.filter(n => n.type === "module")) {
            const moduleId = moduleNode.id;

            for (const routeId of this.g.containsMap.get(moduleId) ?? []) {
                const routeNode = this.g.nodeMap.get(routeId);
                if (!routeNode || routeNode.type !== "route") continue;

                const widgetPaths = this.g.findWidgetPaths(routeId, null);
                for (const { componentId, widgetPath } of widgetPaths) {
                    const prefix: UserJourneyStep[] = [
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
    private _collectGlobal(): UserJourney[] {
        const out: UserJourney[] = [];
        if (!this.g.nodeMap.has("app-root")) return out;

        const globalPaths = this.g.findWidgetPaths("app-root", null);
        for (const { componentId, widgetPath } of globalPaths) {
            const prefix: UserJourneyStep[] = [
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
    private _collectRouteToRoute(): UserJourney[] {
        const out: UserJourney[] = [];

        for (const t of this.nav.transitions as GraphTransition[]) {
            if (!["static-redirect", "routerLink", "href"].includes(t.type)) continue;

            const fromNode = this.g.nodeMap.get(t.from);
            const dest = this.g.nodeMap.get(t.to);
            if (!fromNode || fromNode.type !== "route") continue;
            if (!dest || (dest.type !== "route" && dest.type !== "external-route")) continue;

            const steps: UserJourneyStep[] = [
                { stepType: "module", nodeId: this.g.rootModuleId },
                { stepType: "route", nodeId: t.from },
                { stepType: "interaction", nodeId: t.from, via: t.type, metadata: t.metadata },
                { stepType: dest.type, nodeId: t.to, metadata: t.metadata } as UserJourneyStep,
            ];

            const journeyId = [
                this.g.rootModuleId,
                `${t.from}[${t.type}]`,
                t.to,
            ].join("→");

            out.push({ rootModule: this.g.rootModuleId, id: journeyId, steps });
        }

        return out;
    }
}