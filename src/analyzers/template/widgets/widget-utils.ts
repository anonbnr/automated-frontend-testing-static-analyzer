// ── src/analyzers/template/widgets/widget-utils.ts ──

import { WidgetInfo } from "../../../models/widget-info.js";

export class WidgetUtils {

    static readonly WIDGET_TAGS = new Set([
        // Standard HTML controls
        "button", "input", "option", "select", "textarea", "form", "a",
        // Material (and any custom) widgets
        "mat-button", "mat-icon-button", "mat-select", "mat-checkbox",
        "mat-button-toggle-group", "mat-button-toggle",
        "mat-radio-group", "mat-radio-button",
        "mat-option", "mat-datepicker-toggle",
    ]);

    static readonly VALIDATION_RULES = ['required', 'pattern', 'min', 'max', 'minLength', 'maxLength'];

    /** Which resolved types count as “form fields” */
    static readonly FORM_FIELD_TYPES = new Set<string>([
        'input', 'textarea', 'select',
        'mat-select', 'mat-checkbox', 'mat-radio-group', 'mat-radio-button',
        'mat-button-toggle', 'mat-button-toggle-group',
        'mat-form-field'
    ]);

    /** Which resolved types count as “submit buttons” */
    static readonly SUBMIT_BUTTON_TYPES = new Set<string>([
        'button', 'submit', 'mat-button', 'mat-icon-button'
    ]);

    static isFormField(type: string): boolean {
        return this.FORM_FIELD_TYPES.has(type);
    }

    static isSubmitButton(type: string): boolean {
        return this.SUBMIT_BUTTON_TYPES.has(type);
    }

    /**
     * Given an element’s tag name and its raw `attributes` map,
     * return the “resolved” widget type:
     *  1) If it’s a native `<input>` or `<button>` with a `type` attr, use that
     *  2) Otherwise fall back to the tag name (lower-cased)
     */
    static resolveWidgetType(
        tagName: string,
        attributes: Record<string, any>
    ): string {
        const tag = tagName.toLowerCase();

        // 1) native overrides
        if ((tag === 'input' || tag === 'button') && attributes.type) {
            return String(attributes.type).toLowerCase();
        }

        // 2) fallback
        return tag;
    }

    /**
     * Return the *effective* widget type:
     *  - prefer the raw HTML `type` attribute if present,
     *  - otherwise fall back to the already‐resolved `widget.type`.
     */
    static wType(widget: WidgetInfo): string {
        return (widget.attributes?.['type'] as string) || widget.type;
    }
}
