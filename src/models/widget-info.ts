// ──────────────────────────────────────────────────────────────────────────────
// widget-info.ts
//
// Contains all the “widget-centric” types:
//   - UserEventType / NavEventType (allowed event names)
//   - WidgetInfo (static info about a UI widget)
//   - EventHandlerCallContext (one function-call inside a handler)
//   - EventContext (lists a widget’s event, handler, and the calls it makes)
//   - WidgetEventMap (maps widgetID ⇒ array of EventContext)
// ──────────────────────────────────────────────────────────────────────────────

import { TmplAstNode } from "@angular/compiler";
import { NavEventType, UserEventType } from "./event-info.js";

/**
 * Represents information about a UI widget (a DOM element or interactible third-party library UI component).
 */
export type WidgetInfo = {
    /**
     * Unique identifier for the widget (e.g. 'save-button', 'userInput').
     * This ID must be distinct across the entire application.
     */
    id: string;

    /**
     * Type of the widget (e.g. 'input', 'button', 'form', 'select').
     */
    type: string;

    /**
     * A map of eventName → handlerFunctionName.
     * eventName keys come from `UserEventType` or `NavEventType`.
     * handler values are the component’s method names (e.g., 'onSavePost').
     */
    events: { [K in UserEventType | NavEventType]?: string };

    /**
     * Optional HTML or Angular directive attributes associated with the widget.
     * For example: { placeholder: 'Enter name', value: 'John Doe' }.
     */
    attributes?: {
        [key: string]: any; // allows any attribute → any value
    };

    /**
     * Validation rules (just the rule names, e.g. 'required', 'pattern', 'maxLength').
     * These correlate to Angular form validations or HTML validation constraints.
     */
    validationRules?: string[];

    /**
     * If true, this widget triggers form submission (e.g. <button type="submit">).
     * Otherwise, it’s a non-submitting control.
     */
    triggersFormSubmission?: boolean;

    /**
     * Child widgets nested within this widget’s element.
     *
     * Each entry is a `WidgetInfo` for a widget found inside this one’s
     * template subtree. Used in the three-phase scan to build a hierarchy:
     *   - Level-1 containers (forms, anchors) → children → Level-2 controls → …
     *
     * If no nested widgets were found, this may be `[]` or omitted.
     */
    children?: WidgetInfo[];

    /**
     * The original Angular AST node (`TmplAstElement` or `TmplAstTemplate`)
     * from which this widget was created.
     *
     * Useful for any advanced analyses that need to inspect the node’s
     * full attribute list, structural directives, or sourceSpan.
     */
    originalNode?: TmplAstNode,
}