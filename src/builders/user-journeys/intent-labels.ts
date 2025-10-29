// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/intent-labels.ts
//
//  intent-labels
//  -------------
//  Helpers to derive human-friendly intent labels for user journeys that end on
//  non-route terminals (external/backend/virtual) and a thin wrapper to select
//  the right strategy given a user journey.
// ──────────────────────────────────────────────────────────────────────────────

import logger from "../../logging/logger.js";
import { VIRTUAL_ERROR } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourney, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { IntentResolver } from "./intent-resolver.js";

/**
 * Label an external URL succinctly for UI.
 * - mailto: → "Email • local-part"
 * - tel:    → "Call • digits"
 * - http(s) → "External • hostname"
 * - fallback → "External"
 */
export function labelForExternalUrl(url: string): string {
    try {
        const u = new URL(url);
        if (u.protocol === "mailto:") return `Email • ${u.pathname}`;
        if (u.protocol === "tel:") return `Call • ${u.pathname}`;
        return u.hostname ? `External • ${u.hostname}` : "External";
    } catch (err) {
        logger.debug(
            "[intent-labels] Failed to parse external URL '%s': %o",
            url,
            err
        );
        return "External";
    }
}

/**
 * Label a backend target based on its id path.
 * Examples:
 *  - "/backend"                       → "Background Action"
 *  - "/backend/payments"              → "Call payments service"
 *  - "/backend/payments/capture/card" → "Call payments.capture.card"
 */
export function labelForBackendTarget(id: string): string {
    const parts = id.split("/").filter(Boolean); // ["backend", ...]
    if (parts.length <= 1) return "Background Action";
    if (parts.length === 2) return `Call ${parts[1]} service`;
    return `Call ${parts[1]}.${parts.slice(2).join(".")}`;
}

/**
 * Label a virtual (UI-side) target using its tail segment.
 *  - "/ui/forms/toggle" → "UI • toggle"
 *  - fallback           → "UI • UI Action"
 */
export function labelForVirtual(id: string): string {
    const seg = id.split("/").filter(Boolean).pop() || "UI Action";
    return `UI • ${seg}`;
}

/**
 * Produce a user-friendly "intent" bucket:
 *  - If tail is a route → resolve via IntentResolver.
 *  - If tail is non-route → map using compact labelers above.
 *  - If tail is unknown → fallback to last route in the sequence; otherwise "Other".
 *
 * @param j         A fully built user journey (post-processed).
 * @param resolver  Strategy to label internal routes (titles/redirects).
 * @param unknown   Fallback label when nothing can be inferred ("Other" by default).
 */
export function deriveUserJourneyIntent(
    j: UserJourney,
    resolver: IntentResolver,
    unknown = "Other"
): string {
    const last: UserJourneyStep | undefined = j.steps[j.steps.length - 1];
    if (!last) {
        logger.debug(
            "[intent-labels] Empty user journey %s — using unknown intent '%s'",
            j.id,
            unknown
        );
        return unknown;
    }

    switch (last.stepType) {
        case "route":
            const label = resolver.resolve(last.nodeId);
            logger.log(
                "trace",
                "[intent-labels] Route tail intent: route=%s label=%s",
                last.nodeId,
                label
            );
            return label;
        case "external-route":
            return labelForExternalUrl(last.nodeId);
        case "backend":
            return labelForBackendTarget(last.nodeId);
        case "virtual-route":
            return last.nodeId === VIRTUAL_ERROR ? "Error" : labelForVirtual(last.nodeId);
        default: {
            // Fallback: use the last route encountered earlier in the steps
            const r = [...j.steps].reverse().find(st => st.stepType === "route");
            if (r) {
                const label = resolver.resolve(r.nodeId);
                logger.debug(
                    "[intent-labels] Non-route tail; falling back to last route: route=%s label=%s",
                    r.nodeId,
                    label
                );
                return label;
            }
            logger.debug(
                "[intent-labels] No route found to infer intent for %s — using unknown '%s'",
                j.id,
                unknown
            );
            return unknown;
        }
    }
}