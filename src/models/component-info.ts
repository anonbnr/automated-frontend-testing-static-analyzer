import { WidgetInfo } from "./widget-info.js";

/**
 * Represents information about an Angular component.
 */
export interface ComponentInfo {
    /**
     * The component's selector (e.g., "app-header").
     */
    selector: string;
    /**
     * A list of widgets belonging to this component.
     */
    widgets: WidgetInfo[];

    /**
     * Child components that are nested inside this component.
     * Example: ["app-post-list-item"]
     */
    nestedComponents: string[];
}

/**
 * A map containing all components in the project.
 */
export interface ComponentMap {
    /**
     * An array of all components discovered in the project.
     */
    components: ComponentInfo[];
}