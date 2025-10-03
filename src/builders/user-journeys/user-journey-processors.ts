// src/builders/user-journeys/user-journey-processors.ts
/**
 * user-journey-processors
 * -------------------
 * Pre/post processors for raw user journeys:
 *  - Pre: group siblings by path up to last nav-affecting interaction, pick a primary,
 *    attach compound outcomes, optionally collapse backend tails.
 *  - Post: compute success flag.
 */
import logger from "../../logging/logger.js";
import { VIRTUAL_BACKEND, VIRTUAL_ERROR } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourney, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { endsWithErrorVirtualRoute, lastNavInteractionIndex } from "./user-journey-utils.js";

/**
 * FanoutMode:
 *  - "primary": keep all siblings; the primary carries a 'compound' summary.
 *  - "collapse": keep only the primary; backend tail is collapsed to '/virtual/backend'.
 */
export type FanoutMode = "collapse" | "primary";

/**
 * Pre-processing:
 * - Group by path up to the last nav-affecting interaction (avoid fragmenting on field edits)
 * - Pick a primary (prefer non-error, route > external > backend > virtual)
 * - Optionally collapse backend tails to '/virtual/backend'
 * - Attach compound sibling outcomes to the primary
 */
export class UserJourneyPreProcessor {
    /**
    * Stable grouping key for user journeys equal up to (and including) the last
    * nav-affecting interaction (or the last interaction before terminal).
    */
    fanoutKey(j: UserJourney): string {
        // Horizon = up to and including the last nav-affecting interaction (or last interaction before terminal)
        const horizonIx = lastNavInteractionIndex(j.steps);
        const slice = horizonIx >= 0 ? j.steps.slice(0, horizonIx + 1) : j.steps;

        return slice.map(st =>
            st.stepType === "interaction"
                ? `${st.stepType}:${st.nodeId}:${st.via ?? ""}`
                : `${st.stepType}:${st.nodeId}`
        ).join("→");
    }

    /**
    * Pick a representative among siblings that share the same path up to the interaction.
    * Preference order (non-error first):
    *   1) internal route
    *   2) external-route
    *   3) backend   (nodeId !== "/virtual/error")
    *   4) virtual-route (nodeId !== "/virtual/error")
    *   5) otherwise the first
    */
    pickPrimary(journeys: UserJourney[]): UserJourney {
        const last = (j: UserJourney) => j.steps[j.steps.length - 1];
        const isNonError = (st?: UserJourneyStep) => !!st && st.nodeId !== VIRTUAL_ERROR;
        const find = (p: (j: UserJourney) => boolean) => journeys.find(p);

        return (
            find(s => last(s)?.stepType === "route") ||
            find(s => last(s)?.stepType === "external-route") ||
            find(s => last(s)?.stepType === "backend" && isNonError(last(s))) ||
            find(s => last(s)?.stepType === "virtual-route" && isNonError(last(s))) ||
            journeys[0]
        )!;
    }

    /**
    * Attach sibling outcomes to the primary's tail:
    *   tail.metadata.compound = { routes[], externals[], backend[], virtual[] }
    * Arrays are sorted for stable output.
    */
    attachAuxEffects(primary: UserJourney, auxiliaries: UserJourney[]): void {
        const tail = primary.steps[primary.steps.length - 1];
        const compound = {
            routes: new Set<string>(),
            externals: new Set<string>(),
            backend: new Set<string>(),
            virtual: new Set<string>(),
        };

        for (const j of auxiliaries) {
            const last = j.steps[j.steps.length - 1];
            if (!last) continue;
            switch (last.stepType) {
                case "route":
                    compound.routes.add(last.nodeId); break;
                case "external-route":
                    compound.externals.add(last.nodeId); break;
                case "backend":
                    compound.backend.add(last.nodeId); break;
                case "virtual-route":
                    compound.virtual.add(last.nodeId); break;
            }
        }

        tail.metadata = {
            ...(tail.metadata ?? {}),
            compound: {
                routes: Array.from(compound.routes).sort(),
                externals: Array.from(compound.externals).sort(),
                backend: Array.from(compound.backend).sort(),
                virtual: Array.from(compound.virtual).sort(),
            }
        };
    }

    /**
    * Replace a 'backend' terminal with '/virtual/backend' and keep provenance in:
    *   tail.metadata.collapsedFrom = <original backend id>
    */
    collapseTail(primary: UserJourney): void {
        const tail = primary.steps[primary.steps.length - 1];
        if (tail.stepType === "backend") {
            tail.metadata = { ...(tail.metadata ?? {}), collapsedFrom: tail.nodeId };
            tail.nodeId = VIRTUAL_BACKEND;
        }
    }

    process(raw: UserJourney[], fanoutMode: FanoutMode): UserJourney[] {
        // Group by pre-interaction key
        const groups = new Map<string, UserJourney[]>();
        for (const j of raw) {
            const k = this.fanoutKey(j);
            (groups.get(k) ?? groups.set(k, []).get(k)!).push(j);
        }

        logger.debug("[UserJourneyPreprocessor] groups=%d (fanout=%s)", groups.size, fanoutMode);

        const result: UserJourney[] = [];
        for (const [key, siblings] of groups.entries()) {
            if (siblings.length === 1) {
                result.push(siblings[0]);
                continue;
            }

            const primary = this.pickPrimary(siblings);
            logger.debug("[UserJourneyPreprocessor] group key=%s size=%d → primary=%s", key, siblings.length, primary.id);
            logger.log('trace', "[UserJourneyPreprocessor] auxiliary tails=%o",
                siblings.filter(s => s !== primary).map(s => s.steps[s.steps.length - 1]));


            // Mark auxiliaries (useful for debug/UIs)
            const aux = siblings.filter(j => j !== primary);
            for (const a of aux) {
                const last = a.steps[a.steps.length - 1];
                last.metadata = { ...(last.metadata ?? {}), auxiliaryOf: primary.id };
            }

            if (fanoutMode === "primary") {
                this.attachAuxEffects(primary, aux);
                result.push(...siblings); // keep all; primary carries 'compound' summary
            }
            else {
                // collapse → keep only primary with collapsed backend tail + compound summary
                this.attachAuxEffects(primary, aux);
                this.collapseTail(primary);
                result.push(primary);
            }
        }
        return result;
    }
}

/** Single-purpose post step: compute `success` based on the last step sentinel. */
export class UserJourneyPostProcessor {
    constructor(private steps: UserJourneyStep[]) { }
    computeSuccess(): boolean {
        return !endsWithErrorVirtualRoute(this.steps);
    }
}