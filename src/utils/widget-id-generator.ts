import { v4 as uuidv4 } from 'uuid';

import { TmplAstBoundAttribute, TmplAstElement, TmplAstText } from "@angular/compiler";

export class WidgetIDGenerator {
    private occurrences: Map<string, number> = new Map();
    private readonly IDSeparator = '__';

    generateID(widget: TmplAstElement): string {
        const tag = widget.name.toUpperCase();

        switch (tag) {
            case 'BUTTON':
                return this.generateContextualID(widget, ['name', 'value', 'formControlName']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'A':
                return this.generateContextualID(widget, ['routerLink', 'href', 'name', 'formControlName', 'value']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'INPUT': case 'MAT-CHECKBOX': case 'MAT-RADIO-GROUP': case 'MAT-RADIO-BUTTON': case 'MAT-BUTTON-TOGGLE-GROUP': case 'MAT-BUTTON-TOGGLE':
                return this.generateContextualID(widget, ['name', 'formControlName', 'value', 'placeholder']) || this.generateDefaultID(widget) || this.generateSymbolicID(widget);

            case 'FORM':
                return this.generateContextualID(widget, ['name']) || this.generateBindingID(widget) || this.generateSymbolicID(widget);

            case 'SELECT': case 'MAT-SELECT':
                return this.generateContextualID(widget, ['name', 'formControlName']) || this.generateSymbolicID(widget);

            case 'TEXTAREA':
                return this.generateContextualID(widget, ['name', 'formControlName']) || this.generateSymbolicID(widget);

            default:
                return this.generateDefaultID(widget) || this.generateSymbolicID(widget);
        }
    }

    private generateContextualID(widget: TmplAstElement, attributes: string[]): string | null {
        for (const attr of attributes) {
            const attribute = widget.attributes.find((a) => a.name === attr);
            if (attribute?.value) {
                return `${widget.name}${this.IDSeparator}${attribute.value.trim().replace(/(\s+|\-)/g, '_').toLowerCase()}${this.IDSeparator}${uuidv4()}`;
            }
        }
        return null;
    }

    private generateBindingID(widget: TmplAstElement): string | null {
        const bindings = widget.inputs; // Represents property bindings (`[]`) and two-way bindings (`[()]`)
        for (const binding of bindings) {
            if (binding instanceof TmplAstBoundAttribute) {
                return `${widget.name}${this.IDSeparator}${binding.value.toString().split(/\s/)[0]}${this.IDSeparator}${uuidv4()}`;
            }
        }
        return null;
    }

    private generateDefaultID(widget: TmplAstElement): string | null {
        // Consider textual children for meaningful IDs
        const textNode = widget.children.find((child) => child instanceof TmplAstText) as TmplAstText | undefined;
        const textContent = textNode?.value.trim();
        return textContent ? `${widget.name}${this.IDSeparator}${textContent.replace(/(\s+|\-)/g, '_').toLowerCase()}${this.IDSeparator}${uuidv4()}` : null;
    }

    private generateSymbolicID(widget: TmplAstElement): string {
        const count = this.occurrences.get(widget.name) || 0;
        this.occurrences.set(widget.name, count + 1);
        return `${widget.name}${this.IDSeparator}${count + 1}`;
    }
}