// src/builders/scenarios/scenario-artifact-validator.ts
import logger from "../../logging/logger.js";
import { AppNavigation } from "../../models/navigation-graph.js";
import { Scenario } from "../../models/scenarios/scenario-info.js";

const HEX8 = /__(?:[0-9a-f]{8})(?=($|\/))/i;

function baseId(id: string): string {
    // Preserve URLs; otherwise strip a trailing "__deadbeef" style suffix if present.
    if (/https?:\/\//i.test(id)) return id;
    return id.replace(HEX8, "");
}

export function validateScenarioArtifacts(
    graph: AppNavigation,
    scenarios: Scenario[],
    sampleLimit = 10
): void {
    const nodeIds = new Set(graph.nodes.map(n => n.id));

    // base-id → all graph ids that share that base
    const baseIndex = new Map<string, string[]>();
    for (const n of graph.nodes) {
        const b = baseId(n.id);
        const arr = baseIndex.get(b) ?? [];
        arr.push(n.id);
        baseIndex.set(b, arr);
    }

    let missing = 0;
    const examples: Array<
        { stepType: string; nodeId: string; suggested?: string; ambiguous?: string[] }
    > = [];

    for (const s of scenarios) {
        for (const st of s.steps) {
            if (nodeIds.has(st.nodeId)) continue;

            missing++;
            const b = baseId(st.nodeId);
            const cands = baseIndex.get(b) ?? [];

            if (cands.length === 1) {
                examples.push({ stepType: st.stepType, nodeId: st.nodeId, suggested: cands[0] });
            } else if (cands.length > 1) {
                examples.push({ stepType: st.stepType, nodeId: st.nodeId, ambiguous: cands.slice(0, 3) });
            } else {
                examples.push({ stepType: st.stepType, nodeId: st.nodeId });
            }
        }
    }

    if (missing > 0) {
        logger.warn(
            "[ScenarioValidator] %d step nodeIds are not present in the navigation graph. Showing up to %d examples:",
            missing, Math.min(sampleLimit, examples.length)
        );
        for (const ex of examples.slice(0, sampleLimit)) {
            if (ex.suggested) {
                logger.warn("  step=%s id=%s → suggested=%s (unique base-id match)", ex.stepType, ex.nodeId, ex.suggested);
            } else if (ex.ambiguous) {
                logger.warn("  step=%s id=%s → ambiguous candidates=%o", ex.stepType, ex.nodeId, ex.ambiguous);
            } else {
                logger.warn("  step=%s id=%s → no candidate in graph", ex.stepType, ex.nodeId);
            }
        }
    } else {
        logger.info("[ScenarioValidator] All scenario step nodeIds are aligned with the navigation graph.");
    }

    // Sanity: tail type vs node type (nice-to-have; you already pass this)
    let typeMismatch = 0;
    for (const s of scenarios) {
        const tail = s.steps[s.steps.length - 1];
        const n = graph.nodes.find(n => n.id === tail.nodeId);
        if (n && n.type !== tail.stepType) {
            typeMismatch++;
            logger.warn(
                "[ScenarioValidator] tail type mismatch: scenario=%s stepType=%s graphType=%s id=%s",
                s.id, tail.stepType, n.type, tail.nodeId
            );
        }
    }
    if (typeMismatch === 0) {
        logger.debug("[ScenarioValidator] No tail type mismatches.");
    }

    let baseLookingWidgets = 0;
    for (const s of scenarios) {
        for (const st of s.steps) {
            if (st.stepType === "widget" && !HEX8.test(st.nodeId)) baseLookingWidgets++;
        }
    }
    
    if (baseLookingWidgets) {
        logger.debug("[ScenarioValidator] %d widget steps look like base ids (no hex suffix).", baseLookingWidgets);
    }
}