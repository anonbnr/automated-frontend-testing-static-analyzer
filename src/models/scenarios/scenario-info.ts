// src/models/scenario-info.ts
/**
 * Scenario data model
 * ===================
 * A *scenario* captures one user journey as an ordered stream of steps (U),
 * optionally coupled with a *pruned path* (P) that pins a subgraph authored in the UI.
 *
 * Design goals
 * ------------
 * - Preserve **all interactions** in order (for replay/analytics), but compute
 *   success/intent from the **terminal** step only.
 * - Keep every `nodeId` aligned with the **navigation graph ids**.
 * - Keep the model UI-friendly via `metadata` (small, optional, never required).
 *
 * Invariants
 * ----------
 * - `ScenarioStep.nodeId` is the canonical id from the navigation graph.
 * - `ScenarioStep.via` is set **only** on 'interaction' steps and is a user/nav event
 *   (e.g. 'click' | 'input' | 'change' | 'submit' | 'routerLink' | 'href' | 'static-redirect').
 * - Error sentinels use the canonical id '/virtual/error' and may appear as a final
 *   step of type 'virtual-route' or 'backend'. `success` is false when the last step
 *   equals that sentinel.
 *
 * Typical shapes
 * --------------
 * - Route-scoped:
 *   [module, route, component, ...widget(s), interaction, (route|backend|virtual-route|external-route)]
 * - Global header:
 *   [module, component('app-root'), component(...), ...widget(s), interaction, (route|backend|...)]
 * - Route→route:
 *   [module, route, interaction(via routerLink|href|static-redirect), route]
 */

import logger from "../../logging/logger.js";
import { NavEventType, UserEventType } from "../event-info.js";
import { GraphRelationType } from "../navigation-graph.js";

/** Discrete step kinds in a user journey. Mirrors graph node kinds + "interaction". */
export type ScenarioStepType =
    | 'module'
    | 'route'             // internal route ("/users", "/posts/:id", …)
    | 'external-route'    // external-route (http/https)
    | 'virtual-route'     // ui-effect/virtual-route ("/ui/…/toggleBio")
    | 'component'
    | 'widget'
    | 'interaction'       // the user action on the widget/route
    | 'backend';          // API/service endpoint (synthetic target)

/**
 * One atomic step in the user journey.
 * Use `metadata` for optional, UI-facing context (diffs, validation rules, etc.).
 */
export interface ScenarioStep {
    /** The step kind. */
    stepType: ScenarioStepType;

    /**
    * The node ID (exactly as used in the navigation graph):
    * - module/class name
    * - route path ("/users", "/")
    * - external URL ("https://…")
    * - component selector ("app-header")
    * - widget id ("app-header__button__…")
    * - virtual target ("/ui/…/handler")
    * - backend id (depends on your granularity)
    */
    nodeId: string;

    /**
    * For 'interaction' steps only: the user/nav event that fired.
    * (e.g. 'click' | 'submit' | 'routerLink' | 'href' | 'static-redirect' | 'change' | …)
    */
    via?: UserEventType | NavEventType;

    /** Optional extra context for UIs, diffs, or analytics. */
    metadata?: Record<string, any>;
}

/**
 * Authoring-time subgraph snapshot (optional).
 * All ids/relations here use graph canonicals for safety.
 */
export interface PrunedPath {
    nodes: string[];
    relations: Array<{ type: GraphRelationType; from: string; to: string }>;
}

/**
 * Full scenario artifact S = (P, U) + authoring metadata.
 * `intent` and `success` are derived fields filled by the builder pipeline.
 */
export interface Scenario {
    /** Stable scenario id (auto-generated). */
    id: string;

    /** The module we started in (usually "AppModule"). */
    rootModule: string;

    /** Optional human label set by UI. */
    name?: string;

    /** Absolute project root (for storage/export bucketing). */
    projectRoot?: string;

    /** The ordered list of steps (U). */
    steps: ScenarioStep[];

    /** Optional author-provided pruned path (P). */
    path?: PrunedPath;

    /** High-level bucket, typically derived from the last route. */
    intent?: string;

    /** True iff the scenario does not end on '/virtual/error'. */
    success?: boolean;
}

/**
 * Tiny in-memory registry of scenarios, addressed by stable id.
 * NOTE: This does not dedupe by content, only by id.
 */
export class ScenarioRegistry {
    private scenarios = new Map<string, Scenario>();

    constructor(initial: Scenario[] = []) {
        for (const s of initial) this.add(s);
    }

    /** Add or replace a scenario by its id. */
    add(s: Scenario): void {
        // this.scenarios.set(scenario.id, scenario);
        const exists = this.scenarios.has(s.id);
        this.scenarios.set(s.id, s);

        if (exists)
            logger.warn(`[ScenarioRegistry] Replaced existing scenario id=${s.id}`);
    }

    /** Retrieve a scenario by its unique id (or undefined). */
    getById(id: string): Scenario | undefined {
        return this.scenarios.get(id);
    }

    /** All scenarios, in insertion order. */
    getAll(): Scenario[] {
        return Array.from(this.scenarios.values());
    }

    /** True iff a scenario with this id exists. */
    has(id: string): boolean {
        return this.scenarios.has(id);
    }

    /** Remove a scenario by id; returns true if one existed. */
    remove(id: string): boolean {
        return this.scenarios.delete(id);
    }

    /** Return the number of scenarios in the registry. */
    size(): number {
        return this.scenarios.size;
    }

    /** Clear the registry. */
    clear(): void {
        this.scenarios.clear();
    }

    /** Sorted copy (lexicographically by id). */
    toArray(): Scenario[] {
        return [...this.scenarios.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
}