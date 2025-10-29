// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/user-journey-utils.ts
//
//  user-journey-utils
//  ------------------
//  Small, pure helpers that don't touch the graph. These implement the core
//  step/interaction heuristics used by processors and builders.
// ──────────────────────────────────────────────────────────────────────────────

import { NavEventType } from "../../models/event-info.js";
import { VIRTUAL_ERROR } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";

/** True iff this step's type is "interaction". */
export const isInteractionStep = (s: UserJourneyStep) => s.stepType === "interaction";

/** True iff this step is a terminal step in a user journey. */
export const isTerminalStep = (s: UserJourneyStep) =>
    s.stepType === "route" || s.stepType === "backend" ||
    s.stepType === "external-route" || s.stepType === "virtual-route";

/**
 * True iff an interaction event can change the terminal outcome.
 * The set intentionally includes 'submit' (form-driven navigation).
 *
 * We keep the type guard so callers can safely narrow `via`.
 */
export function isNavEvent(via: any): via is NavEventType | 'submit' {
    return via === 'routerLink' || via === 'href' || via === 'static-redirect' || via === 'submit';
}

/**
 * Find the last interaction likely to affect the terminal outcome.
 *
 * Algorithm:
 *  1) Locate the final terminal step (if any) → define a cutoff.
 *  2) Scan backwards to the last nav-affecting interaction before cutoff.
 *  3) Fallback to the last interaction before cutoff.
 * Returns -1 if no interactions exist.
 */
export function lastNavInteractionIndex(steps: UserJourneyStep[]): number {
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

/**
 * True iff the journey ends with an error sentinel:
 *   last.stepType ∈ {backend, virtual-route} AND last.nodeId === '/virtual/error'
 *
 * (Used to compute `success` flags.)
 */
export function endsWithErrorVirtualRoute(steps: UserJourneyStep[]): boolean {
    const last = steps[steps.length - 1];
    return !!last &&
        (last.stepType === "backend" || last.stepType === "virtual-route") &&
        last.nodeId === VIRTUAL_ERROR;
}