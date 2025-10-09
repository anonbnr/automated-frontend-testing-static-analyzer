// models/user-journeys/user-journey-info.ts
/**
 * User Journey data model
 * ===================
 * A user journey is defined as an ordered stream of steps (U),
 * optionally coupled with a *pruned path* (P) that pins a subgraph authored in the UI.
 *
 * Design goals
 * ------------
 * - Preserve **all interactions** in order (for replay/analytics), but compute
 *   success/intent from the **terminal** step only.
 * - Keep the model UI-friendly via `metadata` (small, optional, never required).
 *
 * Invariants
 * ----------
 * - `UserJourneyStep.id` is the canonical id from the navigation graph.
 * - `UserJourneyStep.via` is set **only** on 'interaction' steps and is a user/nav event
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
export type UserJourneyStepType =
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
export interface UserJourneyStep {
    /** The step kind. */
    stepType: UserJourneyStepType;

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
 * Full user journey artifact (P, U) + authoring metadata.
 * `intent` and `success` are derived fields filled by the builder pipeline.
 */
export interface UserJourney {
    /** Stable user journey id (auto-generated). */
    id: string;

    /** The module we started in (usually "AppModule"). */
    rootModule: string;

    /** Optional human label set by UI. */
    name?: string;

    /** Absolute project root (for storage/export bucketing). */
    projectRoot?: string;

    /** The ordered list of steps (U). */
    steps: UserJourneyStep[];

    /** Optional author-provided pruned path (P). */
    path?: PrunedPath;

    /** High-level bucket, typically derived from the last route. */
    intent?: string;

    /** True iff the user journey does not end on '/virtual/error'. */
    success?: boolean;
}

/**
 * Tiny in-memory registry of user journeys, addressed by stable id.
 * NOTE: This does not dedupe by content, only by id.
 */
export class UserJourneyRegistry {
    private journeys = new Map<string, UserJourney>();

    constructor(initial: UserJourney[] = []) {
        for (const s of initial) this.add(s);
    }

    /** Add or replace a user journey by its id. */
    add(j: UserJourney): void {
        const exists = this.journeys.has(j.id);
        this.journeys.set(j.id, j);

        if (exists)
            logger.warn(`[UserJourneyRegistry] Replaced existing user journey id=${j.id}`);
    }

    /** Retrieve a user journey by its unique id (or undefined). */
    getById(id: string): UserJourney | undefined {
        return this.journeys.get(id);
    }

    /** All user journeys, in insertion order. */
    getAll(): UserJourney[] {
        return Array.from(this.journeys.values());
    }

    /** True iff a user journey with this id exists. */
    has(id: string): boolean {
        return this.journeys.has(id);
    }

    /** Remove a user journey by id; returns true if one existed. */
    remove(id: string): boolean {
        return this.journeys.delete(id);
    }

    /** Return the number of user journeys in the registry. */
    size(): number {
        return this.journeys.size;
    }

    /** Clear the registry. */
    clear(): void {
        this.journeys.clear();
    }

    /** Sorted copy (lexicographically by id). */
    toArray(): UserJourney[] {
        return [...this.journeys.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
}