// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/graph-helpers.ts
//
// graph-helpers
// -------------
// Centralized navigation graph utilities used by assemblers/builders:
//  - parent→children "contains" lookup
//  - node map & root module detection
//  - widget path enumeration (component/widget subtree)
//  - transition queries & deterministic sort
//  - nodeType→UserJourney terminal mapping
//  - event extraction from transitions (service-call → source event)
// 
// This class contains *no* user journey semantics; it abstracts the graph only.
// ──────────────────────────────────────────────────────────────────────────────

import logger from "../../logging/logger.js";
import { AppNavigation, GraphEdge, GraphNode, GraphTransition } from "../../models/navigation-graph.js";
import { TerminalNodeKind } from "../../models/user-journeys/user-journey-constants.js";
import { WidgetPathInfo } from "../../models/widget-info.js";

/**
 * Construct per build; cheap to allocate.
 * Throws if no root module is present (we rely on it for stable journey IDs).
 *
 * Consumers should reuse a single instance per builder pipeline stage.
 */
export class GraphLookups {
    /** parentId -> [childId...] derived from edges[type="contains"] */
    readonly containsMap = new Map<string, string[]>();

    /** id -> GraphNode (O(1) node access throughout builders) */
    readonly nodeMap: Map<string, GraphNode>;

    /** The module node marked as role="root" (required invariant) */
    readonly rootModuleId: string;

    constructor(private nav: AppNavigation) {
        // Build containsMap from graph edges.
        for (const e of nav.edges as GraphEdge[]) {
            if (e.type !== "contains") continue;
            const list = this.containsMap.get(e.from) ?? [];
            list.push(e.to);
            this.containsMap.set(e.from, list);
        }

        // O(1) node lookup table
        this.nodeMap = new Map(nav.nodes.map(n => [n.id, n]));

        // Detect the root module (role="root") — required downstream.
        const root = nav.nodes.find(n => n.type === "module" && n.attributes?.role === "root");
        if (!root) {
            logger.error(
                "[GraphLookups] root module not found. Ensure one 'module' node has attributes.role='root'."
            );
            throw new Error("Root module not found in navigation graph");
        }
        this.rootModuleId = root.id;

        logger.debug(
            "[GraphLookups] init: nodes=%d edges=%d transitions=%d root=%s",
            nav.nodes.length,
            nav.edges.length,
            nav.transitions.length,
            this.rootModuleId
        );
    }

    /**
    * Enumerate all widget paths starting at `parentId`.
    *
    * Rules
    * - If `child` is a component: reset the local path and recurse with that component as context.
    * - If `child` is a widget: extend the current path and continue collecting nested widgets.
    *
    * Returns an array of { componentId, widgetPath }, where widgetPath is ordered from parent to leaf.
    *
    * @param parentId  Node id to start the DFS from (component/route/app-root/etc.)
    * @param lastCompId Most recent component ancestor id. If null, we treat parentId as the component when the first widget appears.
    * @param path      Accumulated widget ids along the current branch.
    */
    findWidgetPaths = (
        parentId: string,
        lastCompId: string | null,
        path: string[] = []
    ): WidgetPathInfo[] => {
        const out: WidgetPathInfo[] = [];
        const children = this.containsMap.get(parentId) ?? [];

        logger.log(
            "trace",
            "[GraphLookups] findWidgetPaths: parent=%s children=%o",
            parentId,
            children
        );

        for (const childId of children) {
            const child = this.nodeMap.get(childId);
            if (!child) {
                logger.warn(
                    "[GraphLookups] contains→child missing from nodeMap: parent=%s childId=%s",
                    parentId,
                    childId
                );
                continue;
            }

            if (child.type === "widget") {
                const comp = lastCompId ?? parentId;
                const newPath = [...path, childId];
                out.push({ componentId: comp, widgetPath: newPath });

                // Continue walking nested widgets under this widget
                out.push(...this.findWidgetPaths(childId, lastCompId, newPath));
            } else if (child.type === "component") {
                // New component scope → reset path
                out.push(...this.findWidgetPaths(childId, childId, []));
            }
            // Other child types (route, backend, etc.) do not contribute to widget paths.
        }
        return out;
    };

    /**
    * Return all dynamic transitions with t.from === id.
    * (The graph can contain multiple kinds of transitions.)
    */
    transitionsFrom = (id: string) =>
        (this.nav.transitions as GraphTransition[]).filter(t => t.from === id);

    /**
    * Map a GraphNode["type"] to a TerminalNodeKind consumable by the assembler.
    * Non-terminal node types collapse to "virtual-route".
    */
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

    /**
    * Type guard: is the node terminal from a user-journey perspective?
    */
    isTerminal(n?: GraphNode): n is GraphNode & { type: TerminalNodeKind } {
        return !!n && (n.type === "route" || n.type === "external-route" || n.type === "backend" || n.type === "virtual-route");
    }

    /** Convenience predicates */
    isBackend(n?: GraphNode): boolean { return !!n && n.type === "backend"; }
    isVirtual(n?: GraphNode): boolean { return !!n && n.type === "virtual-route"; }

    /**
    * Stable comparator for transitions (by "type:to") to ensure deterministic
    * user-journey IDs and repeatable diffs/caches across builds.
    */
    byDeterministicEdge(a: GraphTransition, b: GraphTransition): number {
        const ta = `${a.type}:${a.to}`; const tb = `${b.type}:${b.to}`;
        return ta < tb ? -1 : ta > tb ? 1 : 0;
    }

    /**
    * Human-visible interaction label for a transition.
    * - For 'service-call' transitions, prefer the original user event (metadata.sourceEvent).
    * - Otherwise use the transition type: 'click' | 'routerLink' | 'href' | 'static-redirect' | 'submit' | ...
    */
    viaFromTransition(t: GraphTransition): string {
        if (t.type === "service-call") {
            const via = String(t.metadata?.sourceEvent ?? "click");
            logger.log(
                "trace",
                "[GraphLookups] viaFromTransition: service-call mapped to '%s' (from metadata.sourceEvent)",
                via
            );
            return via;
        }
        return t.type;
    }
}