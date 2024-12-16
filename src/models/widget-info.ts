export type WidgetInfo = {
    id: string; // Unique widget ID
    type: string; // Widget type (e.g., input, button, etc.)
    events: Map<string, string>; // Event-to-handler mapping (e.g., click -> onSavePost)
}