// ──────────────────────────────────────────────────────────────────────────────
// models/component-info.ts
//
// Purpose
//   Metadata types for Angular components discovered during static analysis.
//   These structures feed into higher-level graphs (e.g., navigation,
//   user journeys, widget maps).
//
// Exposed types
//   - ComponentInfo     : static metadata for a single @Component
//   - ComponentRegistry : read-only collection of all ComponentInfo
//
// Notes
//   • `widgets` lists every UI element (WidgetInfo) parsed from the template,
//     including both Angular-bound and plain DOM elements.
//   • `nestedComponents` lists selectors (strings) of child components
//     used inside this component's template — not their definitions.
//   • The registry is immutable after construction; it represents a snapshot
//     of analysis results, not a live binding to source files.
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetInfo } from "./widget-info.js";
import { RowDataPacket } from "mysql2/promise";

/**
 * Static metadata about an Angular component.
 *
 * This data is obtained from static analysis of the component's
 * TypeScript declaration and template. It captures the component's
 * selector, class name, contained widgets, and embedded child components.
 */
export interface ComponentInfo {
    /**
    * The component's selector (e.g., `"app-header"`).
    * Exactly as declared in `@Component({ selector: "..." })`.
    */
    selector: string;

    /**
    * The component's class name (e.g., `"AppHeaderComponent"`).
    * This is the TypeScript class annotated with `@Component()`.
    */
    name: string;

    /**
    * All widgets (DOM or Angular UI elements) detected in this
    * component's template. Each entry corresponds to one `WidgetInfo`
    * describing structure and interactivity.
    */
    widgets: WidgetInfo[];

    /**
    * Selectors of child components nested inside this component's template.
    *
    * Example:
    * ```ts
    * ["app-post-list-item", "app-user-avatar"]
    * ```
    *
    * These strings correspond to other components' selectors,
    * not their full metadata objects.
    */
    nestedComponents: string[];
}

export interface RowComponentInfo extends RowDataPacket {
    selector: string;
    name: string;
    nestedComponents: string;
}

/**
 * Read-only registry of all components discovered in an Angular project.
 *
 * The registry provides convenient lookups by selector or class name,
 * as well as aggregate statistics such as total count.
 */
export class ComponentRegistry {
    private _components: ComponentInfo[];

    /**
    * @param components All `ComponentInfo` objects representing
    *                   every component in the application snapshot.
    */
    constructor(components: ComponentInfo[]) {
        this._components = components;
    }

    /** All components in this registry (immutable snapshot). */
    get components() {
        return this._components;
    }

    /** Total number of components contained in this registry. */
    get size() {
        return this._components.length;
    }

    /**
    * Look up a component by its selector.
    *
    * @param selector The component's selector (e.g., `"app-header"`).
    * @returns The matching `ComponentInfo`, or `undefined` if not found.
    */
    getBySelector(selector: string): ComponentInfo | undefined {
        // Comparison is exact and case-sensitive, matching Angular's selector rules.
        return this.components.find(c => c.selector === selector);
    }

    /**
    * Look up a component by its class name.
    *
    * @param name The component's class name (e.g., `"AppHeaderComponent"`).
    * @returns The matching `ComponentInfo`, or `undefined` if not found.
    */
    getByName(name: string): ComponentInfo | undefined {
        return this.components.find(c => c.name === name);
    }
}