// ──────────────────────────────────────────────────────────────────────────────
// models/component-info.ts
//
// Contains metadata types for Angular components:
//   - ComponentInfo     (selector, class name, widgets, nested child selectors)
//   - ComponentRegistry (collection of all ComponentInfo in the project)
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetInfo } from "./widget-info.js";

/**
 * Represents static information about an Angular component.
 */
export interface ComponentInfo {
    /**
     * The component’s selector (e.g., "app-header").
     * Exactly the string used in @Component({ selector: "..." }).
     */
    selector: string;

    /**
     * The component’s class name (e.g. "AppHeaderComponent").
     * This is the name of the class annotated by the @Component() decorator.
     */
    name: string;

    /**
     * All widgets found in this component’s template.
     * Each WidgetInfo corresponds to one DOM element or UI control.
     */
    widgets: WidgetInfo[];

    /**
     * Selectors of child components that are nested inside this component’s template.
     * For example: ["app-post-list-item", "app-user-avatar"].
     */
    nestedComponents: string[];
}

/**
 * A registry of all components discovered in an Angular project.
 */
export class ComponentRegistry {
    private _components: ComponentInfo[];

    /**
     * @param components All ComponentInfo objects for every component in the application.
     */
    constructor(components: ComponentInfo[]) {
        this._components = components;
    }

    /**
     * All components in this registry.
     */
    get components() {
        return this._components;
    }

    /**
     * Count of all components in this registry.
     */
    get size() {
        return this._components.length;
    }

    /**
     * Returns the component identified by its selector.
     *
     * @param selector The selector of the component (e.g. "app-header").
     * @returns The matching ComponentInfo, or undefined if not found.
     */
    getBySelector(selector: string): ComponentInfo | undefined {
        return this.components.find(c => c.selector === selector);
    }

    /**
     * Returns the component identified by its class name.
     *
     * @param name The class name of the component (e.g. "AppHeaderComponent").
     * @returns The matching ComponentInfo, or undefined if not found.
     */
    getByName(name: string): ComponentInfo | undefined {
        return this.components.find(c => c.name === name);
    }
}