// ──────────────────────────────────────────────────────────────────────────────
// template-utils.ts
//
// Utility functions for working with widget hierarchies extracted from Angular
// templates. These helpers operate on the `WidgetInfo` tree produced by
// `WidgetProcessor`, allowing downstream analyzers to easily traverse or
// transform widget collections.
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetInfo } from "../../models/widget-info.js";

/**
 * A collection of static helper methods for manipulating and querying
 * `WidgetInfo` trees.
 */
export class TemplateUtils {
    /**
     * Flattens a hierarchical tree of `WidgetInfo` into a flat array.
     *
     * This is useful when an analyzer (e.g. `LogicAnalyzer`) needs to process
     * every widget in a component without regard to its nesting structure.
     *
     * @param tree
     *   An array of top-level `WidgetInfo` nodes, each of which may have
     *   a `children` array of further `WidgetInfo`.
     * @returns
     *   A new array containing every widget in the tree, in depth-first order.
     *
     * @example
     * ```ts
     * const nested: WidgetInfo[] = [
     *   { id: "form1", children: [
     *     { id: "input1", children: [] },
     *     { id: "btn1", children: [] }
     *   ] }
     * ];
     * const flat = TemplateUtils.flattenWidgets(nested);
     * console.log(flat.map(w => w.id)); // ["form1", "input1", "btn1"]
     * ```
     */
    static flattenWidgets(tree: WidgetInfo[]): WidgetInfo[] {
        const out: WidgetInfo[] = [];

        const recurse = (list: WidgetInfo[]) => {
            for (const w of list){
                out.push(w);
                if (w.children && w.children.length > 0)
                    recurse(w.children);
            }
        };

        recurse(tree);
        return out;
    }
}