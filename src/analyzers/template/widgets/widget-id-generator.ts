// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/widgets/widget-id-generator.ts
//
// Purpose
//   Generate concise, unique IDs for interactive widgets discovered in Angular
//   templates. IDs aim to be stable and human-readable when possible.
//
// ID sources (priority order):
//   1) Contextual   — from key attributes (name, formControlName, value, placeholder)
//   2) Binding      — for <form> only, from bound inputs (e.g., [formGroup])
//   3) Text-based   — from longest visible text node in the subtree (buttons/anchors)
//   4) Symbolic     — tag-only fallback, de-duplicated per base with a counter
//
// ID formats:
//   • Contextual / Binding / Text-based → "<TAG>__<base>__<8hexUUID>"
//   • Symbolic fallback                 → "<TAG>" or "<TAG>__<n>" (counter if repeated)
//
// Notes
//   • Call resetCounters() between templates to avoid cross-template de-duplication.
//   • The logger emits trace/debug steps for troubleshooting ID decisions.
//   • UUID suffix is used for contextual/binding/text bases; the symbolic fallback
//     intentionally uses counter-based disambiguation (no UUID).
// ──────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';

import { TmplAstBoundAttribute, TmplAstElement, TmplAstNode, TmplAstText } from "@angular/compiler";
import logger from '../../../logging/logger.js';

/**
 * Maps UPPERCASE tag names to prioritized contextual attributes.
 * INPUT-like tags reuse the INPUT priority defined via INPUT_LIKE_TAGS.
 */
const CONTEXTUAL_ATTRS_BY_TAG: Record<string, string[]> = {
    'BUTTON': ['name', 'value', 'formControlName'],
    // Anchors: prefer navigation hints first
    'A': ['routerLink', 'href', 'name', 'formControlName', 'value'],
    // FORM only uses ['name'] here; bound IDs are generated separately in _tryBinding()
    'FORM': ['name'],
    // SELECT variants
    'SELECT': ['name', 'formControlName'],
    'MAT-SELECT': ['name', 'formControlName'],
    'TEXTAREA': ['name', 'formControlName']
    // INPUT-like handled below via INPUT_LIKE_TAGS
};

/**
 * Tags considered INPUT-like. They share the same contextual priorities:
 * name → formControlName → value → placeholder
 */
const INPUT_LIKE_TAGS = new Set([
    'INPUT',
    'MAT-CHECKBOX',
    'MAT-RADIO-GROUP',
    'MAT-RADIO-BUTTON',
    'MAT-BUTTON-TOGGLE-GROUP',
    'MAT-BUTTON-TOGGLE'
]);

/**
 * Generates compact, unique widget IDs for Angular template elements.
 *
 * De-duplication model:
 *  - The computed "base" (after sanitization) is tracked in a per-instance Map.
 *  - If the same base repeats in the same template, a `__<n>` suffix is appended.
 *  - Call `resetCounters()` between templates to avoid cross-template clashes.
 */
export class WidgetIDGenerator {
    /** Tracks how many times each (already sanitized) base has been used. */
    private occurrences: Map<string, number> = new Map();

    /** Separator between ID segments, e.g., "<TAG>__<base>__<uuid8>". */
    readonly ID_SEPARATOR = '__';

    /**
    * Generate a unique ID for a template element.
    *
    * @param widget The AST element to generate an ID for.
    * @returns A string like:
    *          - "BUTTON__save__a1b2c3d4" (contextual/binding/text-based)
    *          - "BUTTON" or "BUTTON__2"  (symbolic fallback with counter)
    */
    generateID(widget: TmplAstElement): string {
        const tag = widget.name.toUpperCase();
        logger.log('trace', '[WidgetIDGenerator] Generating ID for <%s>', tag);

        let base: string | undefined = undefined;

        // 1) Contextual attributes
        if (INPUT_LIKE_TAGS.has(tag))
            base = this._tryContextual(widget, ['name', 'formControlName', 'value', 'placeholder']);
        else if (CONTEXTUAL_ATTRS_BY_TAG[tag])
            base = this._tryContextual(widget, CONTEXTUAL_ATTRS_BY_TAG[tag]);

        if (base)
            logger.log('trace', '[WidgetIDGenerator] Contextual base "%s" for %s', base, tag);

        // 2) Binding-based (forms only)
        if (!base && tag === 'FORM') {
            base = this._tryBinding(widget);
            if (base)
                logger.log('trace', '[WidgetIDGenerator] Binding base "%s" for FORM', base);
        }

        // 3) Text-based
        if (!base) {
            base = this._tryText(widget);
            if (base)
                logger.log('trace', '[WidgetIDGenerator] Text base "%s" for %s', base, tag);
        }

        // 4) Symbolic fallback
        if (!base) {
            base = this._symbolicBase(tag);
            logger.log('trace', '[WidgetIDGenerator] Symbolic fallback base "%s" for %s', base, tag);
        }

        // Normalize slashes to underscores for path-like bases
        base = base.replaceAll('/', '_');

        // De-duplicate the base within this template (counter suffix if repeated)
        const count = (this.occurrences.get(base) || 0) + 1;
        this.occurrences.set(base, count);
        const uniqueBase = count === 1 ? base : `${base}${this.ID_SEPARATOR}${count}`;

        logger.debug('[WidgetIDGenerator] Final ID for %s → %s', tag, uniqueBase);
        return uniqueBase;
    }

    /** Clear per-base counters (call between templates). */
    resetCounters(): void {
        this.occurrences.clear();
        logger.log('trace', '[WidgetIDGenerator] resetCounters() called, occurrences cleared');
    }

    /**
    * Attempt contextual ID based on prioritized attributes.
    *
    * Examples:
    *   <input name="username">    → "INPUT__username__c1a2b3d4"
    *   <button value="save">      → "BUTTON__save__a7b8c9d0"
    */
    private _tryContextual(widget: TmplAstElement, attrs: string[]): string | undefined {
        for (const name of attrs) {
            const attr = widget.attributes.find((a) => a.name === name);
            if (attr?.value?.trim()) {
                // Normalize: collapse space/hyphen to underscore, then lowercase.
                const sanitized = attr.value
                    .trim()
                    .replace(/[\s\-]+/g, "_")
                    .toLowerCase();
                return this._composeWithShortUuid(widget.name, sanitized);
            }
        }
        return undefined;
    }

    /**
    * Attempt binding-based ID for <form> via its bound inputs (e.g., [formGroup]).
    *
    * Example:
    *   <form [formGroup]="userForm"> → "FORM__userForm__d4e5f6a7"
    */
    private _tryBinding(widget: TmplAstElement): string | undefined {
        for (const input of widget.inputs) {
            if (input instanceof TmplAstBoundAttribute) {
                // Grab first token as a stable label (e.g., "userForm" from an expression)
                const raw = input.value
                    .toString()
                    .split(/\s+/)[0]
                    .trim();
                if (raw)
                    return this._composeWithShortUuid(widget.name, raw);
            }
        }

        return undefined;
    }

    /**
    * Attempt text-based ID by walking subtree, collecting TmplAstText,
    * picking the longest text, and normalizing it.
    *
    * Examples:
    *   <button>Submit</button> → "BUTTON__submit__a1b2c3d4"
    *   <a>Learn More</a>       → "A__learn_more__b2c3d4e5"
    */
    private _tryText(widget: TmplAstElement): string | undefined {
        // 1) Recursively collect all TmplAstText node values
        const texts: string[] = [];
        this._collectTexts(widget, texts);

        // 2) Pick the longest text (if any)
        const longest = texts
            .map(t => t.trim())
            .sort((a, b) => b.length - a.length)[0] || '';

        if (!longest)
            return undefined;

        // Replace any sequence of non-alphanumeric characters with underscore, then lowercase.
        const sanitized = longest
            .replace(/[^A-Za-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")  // trim leading/trailing underscores
            .toLowerCase();

        return this._composeWithShortUuid(widget.name, sanitized);
    }

    /** DFS to collect all text node values in the element subtree. */
    private _collectTexts(node: TmplAstNode, outTexts: string[]): void {
        if (node instanceof TmplAstText)
            outTexts.push(node.value);

        if (node instanceof TmplAstElement)
            for (const child of node.children)
                this._collectTexts(child, outTexts);
    }

    /**
    * Symbolic fallback base when no contextual/binding/text information exists.
    * Returns just the tag; uniqueness will be handled by the per-base counter.
    */
    private _symbolicBase(tag: string): string {
        return tag;
    }

    /**
    * Compose "<TAG>__<base>__<shortUuid>" using the first 8 hex digits of a v4 UUID.
    */
    private _composeWithShortUuid(tag: string, base: string): string {
        const shortId = uuidv4().replace(/-/g, "").slice(0, 8);
        return `${tag}${this.ID_SEPARATOR}${base}${this.ID_SEPARATOR}${shortId}`;
    }
}