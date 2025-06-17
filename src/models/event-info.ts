// ──────────────────────────────────────────────────────────────────────────────
// event-info.ts
//
// Contains all the “event-centric” types used to represent user and navigation
// events, plus the shape of the runtime call‐graphs they produce:
//
//   - `UserEventType`     – names of DOM-style widget events (click, submit, etc.)
//   - `NavEventType`      – names of navigation events (routerLink, href, etc.)
//   - `EventHandlerCallContext` – one function call inside an event handler
//   - `EventContext`      – one widget’s event binding, its handler, and all calls
//   - `WidgetEventMap`    – maps a widget’s unique ID to its full list of `EventContext`
//
// These types underpin the business‐logic analysis: mapping from UI widgets and
// their template bindings to the actual methods invoked, and capturing the
// sequence of service calls or navigation transitions that each handler performs.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * DOM-style widget events (e.g. `<button (click)="...">`, `<form (submit)="...">`).
 * Known built-ins: 'click', 'submit', 'input', 'change'.  
 * Additional custom event names (e.g. 'mouseover', 'dblclick') can be also added.
 */
export type UserEventType =
    'click'
    | 'submit'
    | 'input'
    | 'change'
    | string  // Any other custom event string
    ;

/**
 * Navigation-style events, used for routing or redirection.
 *   - 'routerLink'    – Angular `<a [routerLink]="...">`
 *   - 'href'          – plain anchor link
 *   - 'static-redirect' – route file configured redirect
 */
export type NavEventType
    = 'routerLink'
    | 'href'
    | 'static-redirect'
    ;

/**
 * Represents a single function‐call inside an event handler.
 *
 * For example, if a component method does:
 *   `this.router.navigate(['/users']);`
 * then one `EventHandlerCallContext` might be:
 *   `{ caller: 'this.router', called: '/users', data: [] }`
 */
export interface EventHandlerCallContext {
    /**
     * The object or service that makes the call (e.g. 'this.router', 'this.userService').
     */
    caller: string;

    /**
     * The endpoint or function being called (e.g. '/users' or 'savePost').
     */
    called: string;

    /**
     * Any additional parameters passed to that call (e.g. route params, payload strings).
     */
    data: string[];
}

/**
 * Represents one event‐handler binding on a widget, plus all the calls that handler makes.
 *
 * - `event`   : the event name (click, submit, routerLink, etc.)
 * - `handler` : the component method name (e.g. 'onSave')
 * - `calls`   : a list of `EventHandlerCallContext` in execution order
 */
export interface EventContext {
    /**
     * The event name (e.g. 'click', 'submit', 'routerLink', 'href', etc.).
     */
    event: UserEventType | NavEventType;

    /**
     * The component’s method bound to this event (e.g. 'onSavePost', 'onFormSubmit').
     */
    handler: string;

    /**
     * All the function calls made inside that handler, in order.
     */
    calls: EventHandlerCallContext[];
}

/**
 * Maps one widget (by its unique `widgetID`) to all of its event‐handler contexts.
 *
 * This is the primary output of `LogicAnalyzer.analyze()`: for each interactive
 * widget, a list of `EventContext` entries showing how the UI drives business logic.
 */
export interface WidgetEventMap {
    /**
     * The same `WidgetInfo.id` for which these event contexts apply.
     */
    widgetID: string;

    /**
     * A list of all event/handler/calls contexts for this widget.
     */
    events: EventContext[];
}