// ──────────────────────────────────────────────────────────────────────────────
// models/event-info.ts
//
// Contains types for UI and navigation events and their call graphs:
//   - UserEventType              (DOM-style widget events)
//   - NavEventType               (routing/navigation events)
//   - EventHandlerCallContext    (one function-call inside an event handler)
//   - EventContext               (one widget’s event, its handler, and the calls)
//   - WidgetEventMap             (maps widgetID → EventContext[])
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Names of DOM-style widget events, e.g. `<button (click)="...">` or `<form (submit)="...">`.
 * Built-ins include `'click'`, `'submit'`, `'input'`, and `'change'`.
 * Custom event names (e.g. `'mouseover'`) are also allowed.
 */
export type UserEventType
    = 'click'
    | 'submit'
    | 'input'
    | 'change'
    | string;  // Any other custom event string

/**
 * Names of navigation-style events, used for routing or redirection.
 * - `'routerLink'`       → Angular `<a [routerLink]="...">`  
 * - `'navigate'`         → programmatic navigation calls (e.g., navigate(), navigateByUrl(), etc.)`  
 * - `'href'`             → plain anchor link  
 * - `'static-redirect'`  → route file configured redirect  
 * - `'service-call'`     → programmatic service calls  
 */
export type NavEventType
    = 'routerLink'
    | 'href'
    | 'static-redirect';

/**
 * Represents a single function call made inside an event handler.
 * 
 * Example:
 * ```ts
 * // In component code:
 * this.router.navigate(['/users']);
 *
 * // Captured as:
 * {
 *   caller: 'this.router',
 *   called: 'navigate',
 *   data: ['/users']
 * }
 * ```
 */
export interface EventHandlerCallContext {
    /**
     * Object or service making the call (e.g. 'this.router', 'this.userService').
     */
    caller: string;

    /**
     * Target function being called (e.g. 'navigate', 'savePost').
     */
    called: string;

    /**
     * Parameters passed to the call (e.g. route params or payload values).
     */
    data: string[];
}

/**
 * Describes one widget event binding, its handler, and all calls made in that handler.
 */
export interface EventContext {
    /**
     * The event name (e.g. 'click', 'submit', 'routerLink', 'href', etc.).
     */
    event: UserEventType | NavEventType;

    /**
     * The component method bound to this event (e.g. 'onSavePost', 'onFormSubmit').
     */
    handler: string;

    /**
     * List of all function call contexts extracted from that handler, in execution order.
     */
    callContexts: EventHandlerCallContext[];
}

/**
 * Maps a widget’s unique ID to its full list of event contexts.
 *
 * This is the main output of the business-logic analyzer: for each interactive
 * widget, you get a `WidgetEventMap` showing how UI events drive method calls
 * and navigation.
 */
export interface WidgetEventMap {
    /**
     * The `WidgetInfo.id` for which these events apply.
     */
    widgetID: string;

    /**
     * All event/handler/calls contexts for this widget.
     */
    eventContexts: EventContext[];
}