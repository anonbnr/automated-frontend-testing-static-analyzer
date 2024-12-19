import { WidgetInfo } from "./widget-info.js";

export interface ComponentInfo {
    selector: string; // The component's selector, e.g., "app-header"
    widgets: WidgetInfo[]; // Widgets belonging to the component
    nestedComponents: string[]; // Child components, e.g., ["app-post-list-item"]
}

export interface ComponentMap {
    components: ComponentInfo[]; // All components in the project
}