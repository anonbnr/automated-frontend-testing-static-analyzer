// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/user-journey-assembler.ts
//
//  user-journey-assembler
//  ----------------------
//  Declarative, reusable builder that:
//   - Stages module/route/component prefix steps.
//   - Walks a widget path, emitting per-widget steps with authoring metadata.
//   - Detects submit-button → form chains and records a single "submit" interaction.
//   - Emits one user journey per terminal edge (route | external-route | backend | virtual-route).
//   - Avoids duplicate interaction steps with identical (nodeId, via, meta-signature).
//  
//  Notes:
//   - This assembler is purely mechanical: it does not group or label intents
//     (that happens in processors/labels).
//   - Deterministic output: terminal edges are sorted, and journey IDs are stable.
// ──────────────────────────────────────────────────────────────────────────────

import logger from "../../logging/logger.js";
import { UserJourney, UserJourneyStep, UserJourneyStepType } from "../../models/user-journeys/user-journey-info.js";
import { GraphLookups } from "./graph-helpers.js";

/**
 * AssembleContext
 * ---------------
 * Parameters for building user journeys from a single widget path scope.
 *
 * - prefixSteps: absolute steps placed before any widget steps
 *   (e.g., [module, route, component] for route-scoped; or [module, app-root, component] for global).
 * - widgetPath: ordered list of widget ids (leaf last).
 * - rootModuleId: used to derive stable user journey ids.
 */
export interface AssembleContext {
    /** Absolute prefix steps (e.g., module/route or module/app-root/component). */
    prefixSteps: UserJourneyStep[];
    /** Widget path to traverse (IDs in order; last element is the leaf). */
    widgetPath: string[];
    /** The module ID serving as the root scope for the journey ID. */
    rootModuleId: string;
}

export class UserJourneyAssembler {
    constructor(private g: GraphLookups) { }

    /**
    * Build 1..N user journeys from one widget path.
    *
    * Algorithm
    * 1) Stage prefix + widget steps with authoring metadata.
    * 2) For each widget, detect a single trigger→form "submit" chain:
    *    - If a widget has a transition(type="submit") to a widget (the form),
    *      record one interaction { via:"submit" } on the trigger only.
    * 3) Determine terminal origin:
    *    - If submit-form detected → terminals originate from the form widget.
    *    - Else → terminals originate from the leaf widget.
    * 4) For each terminal edge originating from (3):
    *    - Add a final interaction unless we've already recorded a submit on the trigger.
    *    - Add the terminal step (backend/route/virtual/external-route).
    * 5) Synthesize a stable journey id: <root> → <scope> → <path[via]> → <dest>
    *
    * @param ctx Assemble context
    * @returns A list of UserJourney objects (one per terminal outcome)
    */
    assemble(ctx: AssembleContext): UserJourney[] {
        const staged = [...ctx.prefixSteps];
        let submitFormId: string | undefined;

        logger.log(
            "trace",
            "[UserJourneyAssembler] start: root=%s path=%o scope=%o",
            ctx.rootModuleId,
            ctx.widgetPath,
            ctx.prefixSteps.map((s) => `${s.stepType}:${s.nodeId}`)
        );

        // 1) Walk widgets; capture authoring metadata; detect trigger→form submit.
        for (const wid of ctx.widgetPath) {
            const wNode = this.g.nodeMap.get(wid)!;

            // Emit the widget step with authoring metadata for UIs.
            staged.push(this._step("widget", wid, {
                metadata: {
                    attributes: wNode.attributes,
                    validationRules: wNode.validationRules,
                    triggersFormSubmission: wNode.triggersFormSubmission,
                }
            }));


            // Detect trigger→form submit edge (record the "submit" on the trigger only).
            const transitions = this.g.transitionsFrom(wid);
            const submitEdge = transitions.find((t) => t.type === "submit");
            if (submitEdge) {
                const toNode = this.g.nodeMap.get(submitEdge.to);
                if (toNode?.type === "widget") {
                    // Only record submit on the trigger→form edge; do NOT record submit on the form itself.
                    logger.debug("[UserJourneyAssembler] submit chain: trigger=%s → form=%s", wid, submitEdge.to);
                    staged.push(this._step("interaction", wid, { via: "submit" }));
                    submitFormId = submitEdge.to;
                }
                else {
                    // Defensive: a submit to non-widget shouldn't happen, but if it does, don't crash.
                    logger.warn(
                        "[UserJourneyAssembler] submit edge to non-widget ignored: from=%s to=%s type=%s",
                        wid,
                        submitEdge.to,
                        toNode?.type
                    );
                }
            }
        }

        // 2) Decide where to look for terminal outcomes.
        const leaf = ctx.widgetPath[ctx.widgetPath.length - 1];
        const terminalOrigin = submitFormId ?? leaf;

        // 3) Gather terminal edges (deterministically ordered).
        const terminalEdges = this.g
            .transitionsFrom(terminalOrigin)
            .filter((t) => this.g.isTerminal(this.g.nodeMap.get(t.to)))
            .sort(this.g.byDeterministicEdge);

        logger.log(
            "trace",
            "[UserJourneyAssembler] terminal origin=%s edges=%o",
            terminalOrigin,
            terminalEdges.map((t) => `${t.type}:${t.to}`)
        );

        // 4) Emit one journey per terminal edge.
        const journeys: UserJourney[] = [];
        for (const t of terminalEdges) {
            const steps = [...staged];

            // If we didn't already record a submit on the trigger, add the final interaction now.
            if (!submitFormId) {
                this._pushIfNotDuplicate(steps, this._step("interaction", terminalOrigin, {
                    via: this.g.viaFromTransition(t),
                    metadata: t.metadata,
                }));
            }

            // Always add the terminal step itself.
            const dest = this.g.nodeMap.get(t.to)!;
            steps.push(
                this._step(this.g.asUserJourneyTerminal(dest.type), t.to, { metadata: t.metadata })
            );

            // Stable ID: <root> → <path[via]> → <dest>
            const pathId = ctx.widgetPath.join("/");
            const viaTag = submitFormId ? "submit" : this.g.viaFromTransition(t);
            const scopeParts = ctx.prefixSteps
                .filter(st => st.stepType === "route" || st.stepType === "component")
                .map(st => st.nodeId);
            const scopeId = scopeParts.join("/");

            // [root, scopeId, `${pathId}[${viaTag}]`, t.to]
            const journeyId = [ctx.rootModuleId, scopeId, `${pathId}[${viaTag}]`, t.to].join("→");

            logger.debug("[UserJourneyAssembler] journey=%s (origin=%s, via=%s, dest=%s)",
                journeyId, terminalOrigin, viaTag, t.to);

            journeys.push({
                rootModule: ctx.rootModuleId,
                id: journeyId,
                steps,
            });
        }
        return journeys;
    }

    /**
    * Push an interaction step only if it is not a duplicate of the previous interaction.
    * Duplicates are detected via (nodeId, via, shallow metadata signature).
    */
    private _pushIfNotDuplicate(steps: UserJourneyStep[], next: UserJourneyStep) {
        const last = steps[steps.length - 1];
        if (!last || last.stepType !== "interaction" || next.stepType !== "interaction") {
            steps.push(next);
            return;
        }

        const sameNode = last.nodeId === next.nodeId;
        const sameVia = (last as any).via === (next as any).via;

        // Compare a compact signature of the metadata we care about.
        const sig = (m: any) =>
            JSON.stringify({
                service: m?.service,
                method: m?.method,
                handler: m?.handler,
                sourceEvent: m?.sourceEvent,
            });

        const sameMeta = sig(last.metadata) === sig(next.metadata);

        if (sameNode && sameVia && sameMeta) {
            logger.log(
                "trace",
                "[UserJourneyAssembler] skipping duplicate interaction: %o",
                next
            );
            return;
        }

        steps.push(next);
    }

    /** Small helper to produce a UserJourneyStep with optional metadata. */
    private _step(stepType: UserJourneyStepType, id: string, extra?: Partial<UserJourneyStep>): UserJourneyStep {
        return { stepType, nodeId: id, ...(extra ?? {}) };
    }
}