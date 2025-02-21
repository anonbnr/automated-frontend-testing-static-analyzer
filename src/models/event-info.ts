
/**
 * Represents the context of an event handler call.
 */
export interface EventHandlerCallContext {
    /**
     * The caller of the event handler (e.g., `this.router`).
     */
    caller: string;

    /**
     * The target being called (e.g., "/users").
     */
    called: string;

    /**
    * Additional data associated with the event handler call.
    */
    data: string[];
}

/**
 * Represents an event context: an event attached to a widget.
 */
export interface EventContext {
    /**
     * The name of the event (e.g., "click", "ngSubmit").
     */
    event: string;

    /**
     * The name of the handler function for this event.
     */
    handler: string;

    /**
     * A list of function calls made by the event handler.
     */
    calls: EventHandlerCallContext[];
}

/**
 * Maps widget events to their corresponding handlers.
 */
export interface WidgetEventMap {
    /**
     * The unique ID of the widget.
     */
    widgetID: string;

    /**
     * A list of all event contexts for this widget.
     */
    events: EventContext[];
}