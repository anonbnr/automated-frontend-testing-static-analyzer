// analyzers/template/widgets/widget-utils.ts
//
// Purpose
//   Shared heuristics for classifying and resolving widget types while scanning
//   Angular templates. Used by the template analyzer and widget processors.
//
// Exposed
//   - WIDGET_TAGS         : canonical set of tag names considered “widgets”
//   - VALIDATION_RULES    : known validation rule names to look for
//   - FORM_FIELD_TYPES    : resolved types that count as form fields
//   - SUBMIT_BUTTON_TYPES : resolved types that count as submit buttons
//   - isFormField(type)   : classification helper
//   - isSubmitButton(type): classification helper
//   - resolveWidgetType() : compute a stable widget type from tag + attributes
//   - wType(widget)       : prefer HTML `type` attr over `widget.type`
//
// Notes
//   • “Resolved type” means:
//       - For <input>/<button>: the `type` attribute value (lowercased) if present.
//       - Otherwise: the lowercased tag name (e.g., "mat-select").
//   • `SUBMIT_BUTTON_TYPES` intentionally includes "submit" (a resolved type) in
//     addition to tag-like entries; this allows a single check to catch both
//     `<button type="submit">` and `<input type="submit">`.
//   • Attribute values are treated as stringifiable; callers should ensure
//     `attributes` is the analyzer's normalized attribute map.
// -----------------------------------------------------------------------------

import { WidgetInfo } from "../../../models/widget-info.js";

export class WidgetUtils {
    /**
    * Tags that are commonly treated as interactive widgets.
    * Includes native HTML controls and popular Angular Material elements.
    *
    * Note: This is *not* exhaustive; callers may extend/override upstream.
    */
    static readonly WIDGET_TAGS = new Set([
        // Standard HTML controls
        "button", "input", "option", "select", "textarea", "form", "a",

        // Material (and any custom) widgets
        "mat-button", "mat-icon-button", "mat-select", "mat-checkbox",
        "mat-button-toggle-group", "mat-button-toggle",
        "mat-radio-group", "mat-radio-button",
        "mat-option", "mat-datepicker-toggle",
    ]);

    /**
    * Known validation rule names to extract from attributes/directives.
    * These map to either HTML attributes or Angular validators.
    */
    static readonly VALIDATION_RULES = [
        'required', 'pattern', 'min', 'max', 'minLength', 'maxLength'
    ] as const;

    /**
    * Resolved types that count as “form fields”.
    * Includes native inputs and common Material field components.
    *
    * Examples of resolved values matched here:
    *  - "input", "textarea", "select", "mat-select", "mat-checkbox", ...
    */
    static readonly FORM_FIELD_TYPES = new Set<string>([
        'input','textarea', 'select',
        'mat-select', 'mat-checkbox', 'mat-radio-group', 'mat-radio-button',
        'mat-button-toggle', 'mat-button-toggle-group',
        'mat-form-field',
        // ADDED BY NICOLAS, NEEDS CONFIRMATION
        'text',
        'email',
        'number',
        'date',
        'password'
    ]);

    /**
    * Resolved types that count as “submit buttons”.
    * Contains tag-like entries (e.g., "button") and resolved `"submit"`.
    *
    * Examples that will match:
    *  - `<button type="submit">` → resolved type "submit"
    *  - `<input type="submit">`  → resolved type "submit"
    *  - `<button>`               → resolved type "button"
    *  - `<button mat-button>`    → resolved type "mat-button" (covered here)
    */
    static readonly SUBMIT_BUTTON_TYPES = new Set<string>([
        'button', 'submit', 'mat-button', 'mat-icon-button'
    ]);

    /** Returns true iff the given resolved type is considered a form field. */
    static isFormField(type: string): boolean {
        return this.FORM_FIELD_TYPES.has(type);
    }

    /** Returns true iff the given resolved type is considered a submit button. */
    static isSubmitButton(type: string): boolean {
        return this.SUBMIT_BUTTON_TYPES.has(type);
    }

    /**
    * Resolve a widget's *type* from its tag + attributes.
    *
    * Rules:
    *  1) If tag is "input" or "button" and a `type` attribute exists, return that
    *     value lowercased (e.g., "submit", "reset", "radio").
    *  2) Otherwise, return the lowercased tag name (e.g., "mat-select").
    *
    * This yields a stable “resolved type” suitable for classification.
    */
    static resolveWidgetType(
        tagName: string,
        attributes: Record<string, any>
    ): string {
        const tag = tagName.toLowerCase();

        // 1) Native overrides: prefer the HTML `type` attribute when present.
        if ((tag === 'input' || tag === 'button') && attributes.type) {
            return String(attributes.type).toLowerCase();
        }

        // 2) Fallback: use the tag name as the resolved type.
        return tag;
    }

    /**
    * Returns the *effective* widget type for classification:
    *  - prefer the raw HTML `type` attribute if present,
    *  - otherwise fall back to the already-resolved `widget.type`.
    */
    static wType(widget: WidgetInfo): string {
        return (widget.attributes?.['type'] as string) || widget.type;
    }
}