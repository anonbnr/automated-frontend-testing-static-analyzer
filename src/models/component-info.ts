// ──────────────────────────────────────────────────────────────────────────────
// component-info.ts
//
// Contains metadata types for Angular components:
//   - ComponentInfo   (selector, widgets, nested child component selectors)
//   - ComponentRegistry    (collection of all ComponentInfo in the project)
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetInfo } from "./widget-info.js";

/**
 * Represents static information about an Angular component.
 */
export interface ComponentInfo {
    /**
     * The component’s selector (e.g., "app-header").
     * This is exactly the string used in @Component({ selector: "..." }).
     */
    selector: string;

    /**
     * The component's className (e.g., "AppHeaderComponent")
     * This is the name of the class annotated by the @Component() selector
     */
    name: string;

    /**
     * An array of all widgets found in this component’s template.
     * Each `WidgetInfo` corresponds to one DOM element or UI control.
     */
    widgets: WidgetInfo[];

    /**
     * Selectors of any child components that are nested inside this component’s template.
     * For example: ["app-post-list-item", "app-user-avatar"] if those tags appear here.
     */
    nestedComponents: string[];
}

/**
 * A registry of all components discovered in an Angular project.
 */
export class ComponentRegistry {
    /**
     * A list of all `ComponentInfo` objects for every component in the application.
     */
    private _components: ComponentInfo[];

    constructor(components: ComponentInfo[]){
        this._components = components;
    }

    get components(){
        return this._components;
    }

    /**
     * Returns a component in this registry identified by its selector
     * @param selector the selector of the component
     * @returns the component in this registry having the specified selector
     */
    getBySelector(selector: string): ComponentInfo | undefined{
        return this.components.find(c => c.selector === selector);
    }

    /**
     * Returns a component in this registry identified by its class name
     * @param selector the class name of the component
     * @returns the component in this registry having the specified class name
     */
    getByName(name: string): ComponentInfo | undefined{
        return this.components.find(c => c.name === name);
    }
}