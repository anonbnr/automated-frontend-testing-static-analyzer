// src/builders/scenarios/scenario-assembler.ts
/**
 * ScenarioAssembler
 * -----------------
 * Declarative, reusable builder that:
 *  - stages module/route/component,
 *  - walks a widget path, interleaving per-widget metadata and *optional* non-terminal effects,
 *  - recognizes submit-button → form chains,
 *  - emits one scenario per terminal edge (route/external/backend/virtual).
 *  - avoids duplicate interaction/terminal pairs.
 */

import logger from "../../logging/logger.js";
import { Scenario, ScenarioStep, ScenarioStepType } from "../../models/scenarios/scenario-info.js";
import { GraphLookups } from "./graph-helpers.js";

/**
 * AssembleContext
 * ---------------
 * - prefixSteps: absolute steps placed before any widget steps (e.g., [module, route, component]).
 * - widgetPath: ordered list of widget ids (leaf last).
 * - rootModuleId: used to derive stable scenario ids.
 */
export interface AssembleContext {
    // absolute prefix steps (e.g., module/route or module/app-root/component)
    prefixSteps: ScenarioStep[];
    // widget path to traverse (IDs in order)
    widgetPath: string[];
    // moduleId for scenario root
    rootModuleId: string;
}

export class ScenarioAssembler {
    constructor(private g: GraphLookups) { }

    /**
    * Build 1..N scenarios from one widget path:
    * 1) Stage prefix + widget steps with metadata.
    * 2) For each widget (non-leaf, non-form), optionally attach ONE inline *virtual* effect.
    *    (Skip backends here and skip all effects on leaf/form to avoid duplicates.)
    * 3) If we detect a submit-trigger → form chain, terminals originate from the form; otherwise from the leaf.
    * 4) For each terminal edge, add a final interaction (unless already *submit* via a trigger) + terminal step.
    * 5) Construct a stable id: <rootModuleId> → <path[via]> → <dest>.
    */
    assemble(ctx: AssembleContext): Scenario[] {
        const staged = [...ctx.prefixSteps];
        let submitFormId: string | undefined;

        // 1) Walk widgets, attach metadata; 2) add at most one inline *virtual* effect on non-leaf, non-form widgets.
        for (const wid of ctx.widgetPath) {
            const wNode = this.g.nodeMap.get(wid)!;

            // Stage the widget itself with authoring metadata.
            staged.push(this._step("widget", wid, {
                metadata: {
                    attributes: wNode.attributes,
                    validationRules: wNode.validationRules,
                    triggersFormSubmission: wNode.triggersFormSubmission,
                }
            }));


            // Detect trigger → form (record *submit* once, on the trigger).
            const transitions = this.g.transitionsFrom(wid);
            const submitEdge = transitions.find((t) => t.type === "submit");
            if (submitEdge) {
                const toNode = this.g.nodeMap.get(submitEdge.to);
                if (toNode?.type === "widget") {
                    // Only record submit on the trigger→form edge; do NOT record submit on the form itself.
                    logger.debug("[ScenarioAssembler] submit chain: trigger=%s → form=%s", wid, submitEdge.to);
                    staged.push(this._step("interaction", wid, { via: "submit" }));
                    submitFormId = submitEdge.to;
                }
            }
        }

        // 3) Terminals originate from the leaf or the form (if a trigger submitted to a form).
        const leaf = ctx.widgetPath[ctx.widgetPath.length - 1];
        const terminalOrigin = submitFormId ?? leaf;
        const terminalEdges = this.g
            .transitionsFrom(terminalOrigin)
            .filter((t) => this.g.isTerminal(this.g.nodeMap.get(t.to)))
            .sort(this.g.byDeterministicEdge);

        // 4) One scenario per terminal edge; add a final interaction unless already covered by trigger submit.
        const scenarios: Scenario[] = [];
        for (const t of terminalEdges) {
            const steps = [...staged];

            // Avoid a second "submit" interaction when we already recorded it on the trigger.
            if (!submitFormId) {
                this._pushIfNotDuplicate(steps, this._step("interaction", terminalOrigin, {
                    via: this.g.viaFromTransition(t),
                    metadata: t.metadata,
                }));
            }

            // Always add the terminal step (backend/route/virtual/external-route).
            const dest = this.g.nodeMap.get(t.to)!;
            steps.push(
                this._step(this.g.asScenarioTerminal(dest.type), t.to, { metadata: t.metadata })
            );

            // Stable id: <root> → <path[via]> → <dest>
            const pathId = ctx.widgetPath.join("/");
            const viaTag = submitFormId ? "submit" : this.g.viaFromTransition(t);
            const scopeParts = ctx.prefixSteps
                .filter(st => st.stepType === "route" || st.stepType === "component")
                .map(st => st.nodeId);
            const scopeId = scopeParts.join("/");
            
            // [root, scopeId, `${pathId}[${viaTag}]`, t.to]
            const scenarioId = [ctx.rootModuleId, scopeId, `${pathId}[${viaTag}]`, t.to].join("→");

            logger.debug("[ScenarioAssembler] scenario=%s (origin=%s, via=%s, dest=%s)",
                scenarioId, terminalOrigin, viaTag, t.to);

            scenarios.push({
                rootModule: ctx.rootModuleId,
                id: scenarioId,
                steps,
            });
        }
        return scenarios;
    }

    /** Avoid pushing the same interaction twice in a row (same nodeId + via + shallow metadata signature). */
    private _pushIfNotDuplicate(steps: ScenarioStep[], next: ScenarioStep) {
        const last = steps[steps.length - 1];
        if (!last || last.stepType !== "interaction" || next.stepType !== "interaction") {
            steps.push(next);
            return;
        }

        const sameNode = last.nodeId === next.nodeId;
        const sameVia = (last as any).via === (next as any).via;

        // Compare a compact signature of metadata we care about (service/method/handler/sourceEvent)
        const sig = (m: any) =>
            JSON.stringify({
                service: m?.service,
                method: m?.method,
                handler: m?.handler,
                sourceEvent: m?.sourceEvent,
            });

        const sameMeta = sig(last.metadata) === sig(next.metadata);

        if (!(sameNode && sameVia && sameMeta)) steps.push(next);
    }

    /** Small helper to produce a ScenarioStep with optional metadata. */
    private _step(stepType: ScenarioStepType, id: string, extra?: Partial<ScenarioStep>): ScenarioStep {
        return { stepType, nodeId: id, ...(extra ?? {}) };
    }
}