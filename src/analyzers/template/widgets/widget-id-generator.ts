import { v4 as uuidv4 } from 'uuid';

import { TmplAstBoundAttribute, TmplAstElement, TmplAstText } from "@angular/compiler";

/**
 * Generates **unique identifiers (IDs)** for widgets in Angular templates.
 *
 * The ID format follows:  
 * - `<widget-type>__<contextual-name>__<UUID>` (for contextual IDs)  
 * - `<widget-type>__<count>` (for symbolic IDs when no context is available)
 */
export class WidgetIDGenerator {
    private occurrences: Map<string, number> = new Map();
    private readonly IDSeparator = '__';

    /**
     * Generates a **unique widget ID** based on its attributes, text content, or a fallback strategy.
     *
     * **Priority order for ID generation:**
     * 1. **Contextual ID**: Uses specific attributes (e.g., `name`, `formControlName`).
     * 2. **Default ID**: Uses meaningful text content (e.g., button labels).
     * 3. **Symbolic ID**: Generates an incremented number per widget type.
     *
     * @param widget - The Angular template widget element.
     * @returns A **unique widget ID**.
     */
    generateID(widget: TmplAstElement): string {
        const tag = widget.name.toUpperCase();

        switch (tag) {
            case 'BUTTON':
                return this.generateContextualID(widget, ['name', 'value', 'formControlName']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'A':
                return this.generateContextualID(widget, ['routerLink', 'href', 'name', 'formControlName', 'value']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'INPUT':
            case 'MAT-CHECKBOX':
            case 'MAT-RADIO-GROUP':
            case 'MAT-RADIO-BUTTON':
            case 'MAT-BUTTON-TOGGLE-GROUP':
            case 'MAT-BUTTON-TOGGLE':
                return this.generateContextualID(widget, ['name', 'formControlName', 'value', 'placeholder']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'FORM':
                return this.generateContextualID(widget, ['name']) || this.generateBindingID(widget) || this.generateSymbolicID(widget);

            case 'SELECT':
            case 'MAT-SELECT':
                return this.generateContextualID(widget, ['name', 'formControlName']) || this.generateSymbolicID(widget);

            case 'TEXTAREA':
                return this.generateContextualID(widget, ['name', 'formControlName']) || this.generateSymbolicID(widget);

            default:
                return this.generateDefaultID(widget) || this.generateSymbolicID(widget);
        }
    }

    /**
     * Generates an ID **based on meaningful attributes** (e.g., `name`, `value`, `formControlName`).
     *
     * **Example:**
     * - `<input name="username">` → `INPUT__username__<UUID>`
     * - `<button value="save">` → `BUTTON__save__<UUID>`
     *
     * @param widget - The Angular template widget element.
     * @param attributes - List of attributes to check for meaningful naming.
     * @returns A **contextual ID** or `null` if no relevant attribute is found.
     */
    private generateContextualID(widget: TmplAstElement, attributes: string[]): string | null {
        for (const attr of attributes) {
            const attribute = widget.attributes.find((a) => a.name === attr);
            if (attribute?.value) {
                return `${widget.name}${this.IDSeparator}${attribute.value.trim().replace(/(\s+|\-)/g, '_').toLowerCase()}${this.IDSeparator}${uuidv4()}`;
            }
        }
        return null;
    }

    /**
     * Generates an ID **based on Angular bindings** (`[]` or `[()]` syntax).
     *
     * **Example:**
     * - `<form [formGroup]="userForm">` → `FORM__userForm__<UUID>`
     *
     * @param widget - The Angular template widget element.
     * @returns A **binding-based ID** or `null` if no binding is found.
     */
    private generateBindingID(widget: TmplAstElement): string | null {
        const bindings = widget.inputs; // Represents property bindings (`[]`) and two-way bindings (`[()]`)
        for (const binding of bindings) {
            if (binding instanceof TmplAstBoundAttribute) {
                return `${widget.name}${this.IDSeparator}${binding.value.toString().split(/\s/)[0]}${this.IDSeparator}${uuidv4()}`;
            }
        }
        return null;
    }

    /**
     * Generates an ID **based on textual content**, such as button labels.
     *
     * **Example:**
     * - `<button>Submit</button>` → `BUTTON__submit__<UUID>`
     *
     * @param widget - The Angular template widget element.
     * @returns A **text-based ID** or `null` if no relevant text is found.
     */
    private generateDefaultID(widget: TmplAstElement): string | null {
        // Consider textual children for meaningful IDs
        const textNode = widget.children.find((child) => child instanceof TmplAstText) as TmplAstText | undefined;
        const textContent = textNode?.value.trim();
        return textContent ? `${widget.name}${this.IDSeparator}${textContent.replace(/(\s+|\-)/g, '_').toLowerCase()}${this.IDSeparator}${uuidv4()}` : null;
    }

    /**
     * Generates a **fallback symbolic ID** when no contextual information is available.
     *
     * **Example:**
     * - `<button>` → `BUTTON__1`
     * - `<input>` → `INPUT__2`
     *
     * @param widget - The Angular template widget element.
     * @returns A **symbolic ID** based on the widget type and an incrementing count.
     */
    private generateSymbolicID(widget: TmplAstElement): string {
        const count = this.occurrences.get(widget.name) || 0;
        this.occurrences.set(widget.name, count + 1);
        return `${widget.name}${this.IDSeparator}${count + 1}`;
    }
}