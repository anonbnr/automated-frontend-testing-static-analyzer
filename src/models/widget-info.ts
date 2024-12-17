export type WidgetInfo = {
    id: string; // Unique widget ID
    type: string; // Widget type (e.g., input, button, etc.)
    events: Map<string, string>; // Event-to-handler mapping (e.g., click -> onSavePost)
}

export interface EventHandlerCallContext {
    caller: string; // The caller of the handler (e.g., this.router)
    called: string; // The target being called (e.g., '/users')
    data: string[];   // Additional data, if available
}

export interface EventContext {
    event: string; // Event name (e.g., click, ngSubmit)
    handler: string; // Handler name (e.g., onSaveUser)
    calls: EventHandlerCallContext[]; // Handler's calls
}

export interface WidgetEventMap {
    widgetID: string; // Widget identifier
    events: EventContext[]; // All events for this widget
}