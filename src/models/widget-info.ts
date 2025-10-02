// ──────────────────────────────────────────────────────────────────────────────
// models/widget-info.ts
//
// Contains metadata types for UI widgets extracted from Angular templates:
//   - WidgetInfo (static info about a UI widget)
// ──────────────────────────────────────────────────────────────────────────────

import { TmplAstNode } from "@angular/compiler";
import { NavEventType, UserEventType } from "./event-info.js";

/**
 * Represents a UI widget (a DOM element or third-party component)
 * in an Angular template, along with its associated metadata.
 */
export interface WidgetInfo {
    /**
     * Globally unique identifier for this widget (e.g. 'save-button').
     * This ID must be unique across the entire application.
     */
    id: string;

    /**
     * The widget’s element type or tag (e.g. 'input', 'button', 'form').
     */
    type: string;

    /**
     * Map of event name → handler method name.
     * Event names come from `UserEventType` or `NavEventType`.
     */
    events: Record<UserEventType | NavEventType, string | undefined>;

    /**
     * Raw HTML attributes or Angular directive inputs on this widget.
     * For example: `{ placeholder: 'Enter name', value: 'John' }`.
     */
    attributes?: Record<string, any>;

    /**
     * Names of validation rules applied to this widget
     * (e.g. ['required', 'minLength']).
     */
    validationRules?: string[];

    /**
     * True if this widget causes form submission
     * (e.g. `<button type="submit">`).
     */
    triggersFormSubmission?: boolean;

    /**
     * Child widgets nested within this widget’s template subtree.
     * Used to build a hierarchy when scanning Angular templates.
     */
    children?: WidgetInfo[];

    /**
     * The original Angular AST node (`TmplAstElement` or `TmplAstTemplate`)
     * from which this widget was created.
     * Useful for deeper analyses that require sourceSpan or directive details.
     */
    originalNode?: TmplAstNode,
}

export type WidgetPathInfo = { componentId: string; widgetPath: string[] };