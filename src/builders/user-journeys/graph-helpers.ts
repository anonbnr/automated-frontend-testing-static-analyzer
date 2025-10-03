// src/builders/user-journeys/graph-helpers.ts
/**
 * graph-helpers
 * -------------
 * Centralized navigation graph utilities used by assemblers/builders:
 *  - parent→children "contains" lookup
 *  - node map & root module detection
 *  - widget path enumeration (component/widget subtree)
 *  - transition queries & deterministic sort
 *  - nodeType→UserJourney terminal mapping
 *  - event extraction from transitions (service-call → source event)
 *
 * This class contains *no* user journey semantics; it abstracts the graph only.
 */

import { AppNavigation, GraphEdge, GraphNode, GraphTransition } from "../../models/navigation-graph.js";
import { TerminalNodeKind } from "../../models/user-journeys/user-journey-constants.js";
import { WidgetPathInfo } from "../../models/widget-info.js";

/**
 * Constructed per build, cheap to allocate. Throws if no root module is present.
 * Consumers should reuse a single instance per builder pipeline stage.
 */
export class GraphLookups {
    readonly containsMap = new Map<string, string[]>();
    readonly nodeMap: Map<string, GraphNode>;
    readonly rootModuleId: string;

    constructor(private nav: AppNavigation) {
        // contains map
        for (const e of nav.edges as GraphEdge[]) {
            if (e.type !== "contains") continue;
            const list = this.containsMap.get(e.from) ?? [];
            list.push(e.to);
            this.containsMap.set(e.from, list);
        }

        this.nodeMap = new Map(nav.nodes.map(n => [n.id, n]));
        const root = nav.nodes.find(n => n.type === "module" && n.attributes?.role === "root");
        if (!root) throw new Error("Root module not found in navigation graph");
        this.rootModuleId = root.id;
    }

    /**
    * Enumerate all widget paths starting at `parentId`.
    * - If `child` is a component: reset the local path and recurse with that component.
    * - If `child` is a widget: extend the path and continue collecting.
    * Returns an array of { componentId, widgetPath } where `widgetPath` is ordered.
    */
    findWidgetPaths = (
        parentId: string,
        lastCompId: string | null,
        path: string[] = []
    ): WidgetPathInfo[] => {
        const out: WidgetPathInfo[] = [];
        for (const childId of this.containsMap.get(parentId) ?? []) {
            const child = this.nodeMap.get(childId);
            if (!child) continue;

            if (child.type === "widget") {
                const comp = lastCompId ?? parentId;
                const newPath = [...path, childId];
                out.push({ componentId: comp, widgetPath: newPath });
                out.push(...this.findWidgetPaths(childId, lastCompId, newPath));
            } else if (child.type === "component") {
                out.push(...this.findWidgetPaths(childId, childId, []));
            }
        }
        return out;
    };

    /** All dynamic transitions whose `from` equals the provided id. */
    transitionsFrom = (id: string) =>
        (this.nav.transitions as GraphTransition[]).filter(t => t.from === id);

    /** Terminal checks/mapping used by the assembler. */
    asUserJourneyTerminal(nodeType: GraphNode["type"]): TerminalNodeKind {
        switch (nodeType) {
            case "route":
            case "external-route":
            case "backend":
            case "virtual-route":
                return nodeType;
            default:
                return "virtual-route";
        }
    }

    isTerminal(n?: GraphNode): n is GraphNode & { type: TerminalNodeKind } {
        return !!n && (n.type === "route" || n.type === "external-route" || n.type === "backend" || n.type === "virtual-route");
    }

    isBackend(n?: GraphNode): boolean { return !!n && n.type === "backend"; }
    isVirtual(n?: GraphNode): boolean { return !!n && n.type === "virtual-route"; }

    /**
    * Stable ordering for transitions to make user journey IDs deterministic
    * (important for regression diffs and caching).
    */
    byDeterministicEdge(a: GraphTransition, b: GraphTransition): number {
        const ta = `${a.type}:${a.to}`; const tb = `${b.type}:${b.to}`;
        return ta < tb ? -1 : ta > tb ? 1 : 0;
    }

    /**
    * Human-visible interaction type for a transition.
    * - For 'service-call', prefer the original user event (metadata.sourceEvent).
    * - Otherwise use the transition type ('click', 'routerLink', etc.).
    */
    viaFromTransition(t: GraphTransition): string {
        if (t.type === "service-call") return String(t.metadata?.sourceEvent ?? "click");
        return t.type;
    }
}