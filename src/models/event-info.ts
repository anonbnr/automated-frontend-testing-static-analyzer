// ──────────────────────────────────────────────────────────────────────────────
// models/event-info.ts
//
// Purpose
//   Canonical types for UI and navigation events extracted from Angular
//   templates and component code, plus the call graphs of their handlers.
//
// Exposed types
//   - UserEventType           : DOM-style widget events (click, submit, …)
//   - NavEventType            : navigation triggers (routerLink, navigate, …)
//   - EventHandlerCallContext : one function call inside an event handler
//   - EventContext            : one event → handler → ordered calls
//   - WidgetEventMap          : groups all EventContext for a widget ID
//
// Notes
//   • Event names are normalized: template syntax like (click) becomes "click".
//   • Navigation intent may come from templates (routerLink, href), static
//     route config (static-redirect), or programmatic calls (navigate*,
//     service-call).
//   • Call arguments are stored as strings for portability and searchability
//     (e.g., JSON/stringified literals).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Names of DOM-style widget events, e.g. `<button (click)="...">` or `<form (submit)="...">`.
 * Built-ins include `"click"`, `"submit"`, `"input"`, and `"change"`.
 * Custom event names (e.g., `"mouseover"`) are also allowed.
 */
export type UserEventType
    = 'click'
    | 'submit'
    | 'input'
    | 'change'
    | string;  // Any other custom event string

/**
 * Names of navigation-style events, used for routing or redirection.
 *
 * - `"routerLink"`      → Angular template navigation: `<a [routerLink]="...">`
 * - `"href"`            → plain anchor link navigation
 * - `"static-redirect"` → redirect defined in route config (no user handler)
 * - `"navigate"`        → programmatic Router navigation (e.g., `router.navigate(...)`)
 * - `"navigateByUrl"`   → programmatic Router navigation by URL
 * - `"service-call"`    → programmatic service-led navigation/side-effect that leads to a route change
 */
export type NavEventType =
    | "routerLink"
    | "href"
    | "static-redirect"
    | "navigate"
    | "navigateByUrl"
    | "service-call";

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
 *   caller: "this.router",
 *   called: "navigate",
 *   data: ["/users"]
 * }
 * ```
 */
export interface EventHandlerCallContext {
    /** Object or service making the call (e.g., `"this.router"`, `"this.userService"`). */
    caller: string;

    /** Target function being called (e.g., `"navigate"`, `"savePost"`). */
    called: string;

    /**
    * Parameters passed to the call (e.g., route params or payload values),
    * represented in a stringified/serialized form for portability.
    */
    data: string[];
}

/**
 * Describes one widget event binding, its handler, and all calls made in that handler.
 */
export interface EventContext {
    /** Normalized event name (e.g., `"click"`, `"submit"`, `"routerLink"`, `"navigate"`). */
    event: UserEventType | NavEventType;

    /** The component method bound to this event (e.g., `"onSavePost"`, `"onFormSubmit"`). */
    handler: string;

    /** All function-call contexts extracted from the handler, in execution order. */
    callContexts: EventHandlerCallContext[];
}

/**
 * Maps a widget's unique ID to its full list of event contexts.
 *
 * This is the main output of the business-logic analyzer: for each interactive
 * widget, you get an ordered view of how UI events drive method calls and navigation.
 */
export interface WidgetEventMap {
    /** The `WidgetInfo.id` for which these events apply. */
    widgetID: string;

    /** All event/handler/calls contexts for this widget. */
    eventContexts: EventContext[];
}