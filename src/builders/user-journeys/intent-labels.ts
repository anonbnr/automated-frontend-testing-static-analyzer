// builders/user-journeys/intent-labels.ts
/**
 * intent-labels
 * -------------
 * Helpers to derive human-friendly intent labels for user journeys that end on
 * non-route terminals (external/backend/virtual) and a thin wrapper to select
 * the right strategy given a user journey.
 */

import { VIRTUAL_ERROR } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourney, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { IntentResolver } from "./intent-resolver.js";

/** Label an external URL succinctly. */
export function labelForExternalUrl(url: string): string {
    try {
        const u = new URL(url);
        if (u.protocol === "mailto:") return `Email • ${u.pathname}`;
        if (u.protocol === "tel:") return `Call • ${u.pathname}`;
        return u.hostname ? `External • ${u.hostname}` : "External";
    } catch {
        return "External";
    }
}

/** Label a backend target based on its granularity path. */
export function labelForBackendTarget(id: string): string {
    const parts = id.split("/").filter(Boolean); // ["backend", ...]
    if (parts.length <= 1) return "Background Action";
    if (parts.length === 2) return `Call ${parts[1]} service`;
    return `Call ${parts[1]}.${parts.slice(2).join(".")}`;
}

/** Label a virtual target (UI effect) using its tail. */
export function labelForVirtual(id: string): string {
    const seg = id.split("/").filter(Boolean).pop() || "UI Action";
    return `UI • ${seg}`;
}

/**
 * Map the last meaningful step of a user journey into a bucket label for UIs.
 * Falls back to the last route (via resolver) when the tail isn't a route.
 */
export function deriveUserJourneyIntent(
    j: UserJourney,
    resolver: IntentResolver,
    unknown = "Other"
): string {
    const last: UserJourneyStep | undefined = j.steps[j.steps.length - 1];
    if (!last) return unknown;

    switch (last.stepType) {
        case "route": return resolver.resolve(last.nodeId);
        case "external-route": return labelForExternalUrl(last.nodeId);
        case "backend": return labelForBackendTarget(last.nodeId);
        case "virtual-route": return last.nodeId === VIRTUAL_ERROR ? "Error" : labelForVirtual(last.nodeId);
        default: {
            const r = [...j.steps].reverse().find(st => st.stepType === "route");
            return r ? resolver.resolve(r.nodeId) : unknown;
        }
    }
}