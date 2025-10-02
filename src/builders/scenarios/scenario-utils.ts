// src/builders/scenarios/scenario-utils.ts
/**
 * scenario-utils
 * --------------
 * Small, pure helpers that don't touch the graph. These implement the core
 * step/interaction heuristics used by processors and builders.
 */

import { NavEventType } from "../../models/event-info.js";
import { VIRTUAL_ERROR } from "../../models/scenarios/scenario-constants.js";
import { ScenarioStep } from "../../models/scenarios/scenario-info.js";

/** True iff this step's type is "interaction" */
export const isInteractionStep = (s: ScenarioStep) => s.stepType === "interaction";

/** True iff this step is a terminal step in a scenario */
export const isTerminalStep = (s: ScenarioStep) =>
    s.stepType === "route" || s.stepType === "backend" ||
    s.stepType === "external-route" || s.stepType === "virtual-route";

/**
 * True iff an interaction event can change the terminal outcome.
 * The set intentionally includes 'submit' (form-driven navigation).
 */
export function isNavEvent(via: any): via is NavEventType | 'submit' {
    return via === 'routerLink' || via === 'href' || via === 'static-redirect' || via === 'submit';
}

/**
 * Find the last interaction likely to affect the terminal outcome.
 * Algorithm:
 *   1) Locate the final terminal step (if any) → define a cutoff.
 *   2) Scan backwards to the last nav-affecting interaction before cutoff.
 *   3) Fallback to the last interaction before cutoff.
 * Returns -1 if no interactions exist.
 */
export function lastNavInteractionIndex(steps: ScenarioStep[]): number {
    if (!steps.length) return -1;

    // Find the index of the final terminal step, if present.
    let cutoff = steps.length;
    for (let i = steps.length - 1; i >= 0; i--) {
        if (isTerminalStep(steps[i])) { cutoff = i; break; }
    }

    // Prefer the last nav-affecting interaction before the cutoff.
    for (let i = cutoff - 1; i >= 0; i--) {
        const s = steps[i];
        if (isInteractionStep(s) && isNavEvent(s.via)) return i;
    }

    // Fallback: any interaction before the cutoff.
    for (let i = cutoff - 1; i >= 0; i--) {
        if (isInteractionStep(steps[i])) return i;
    }

    return -1;
}

/** True iff last step is NOT '/virtual/error' (backend/virtual). */
export function endsWithErrorVirtualRoute(steps: ScenarioStep[]): boolean {
    const last = steps[steps.length - 1];
    return !!last &&
        (last.stepType === "backend" || last.stepType === "virtual-route") &&
        last.nodeId === VIRTUAL_ERROR;
}