// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/widgets/widget-id-generator.ts
//
// Generates unique, concise IDs for interactive widgets in Angular templates.
//   - Contextual IDs from key attributes (name, formControlName, value, placeholder)
//   - Binding-based IDs for `<form>` elements ([formGroup], etc.)
//   - Text-based IDs from button/anchor text when no attributes are present
//   - Symbolic fallback IDs per tag plus an 8-hex-digit UUID suffix
// ──────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';

import { TmplAstBoundAttribute, TmplAstElement, TmplAstNode, TmplAstText } from "@angular/compiler";
import logger from '../../../logging/logger.js';

/**
 * Maps uppercase tag names to their “contextual” attribute priorities.
 * If a tag isn’t listed but is INPUT-like (checkboxes, radios, toggles), INPUT's list is used.
 */
const CONTEXTUAL_ATTRS_BY_TAG: Record<string, string[]> = {
    'BUTTON': ['name', 'value', 'formControlName'],
    // ANCHORS: check routerLink / href first, then name/formControlName/value
    'A': ['routerLink', 'href', 'name', 'formControlName', 'value'],
    // FORM only uses [ 'name' ] in generateContextualID; binding IDs are generated separately
    'FORM': ['name'],
    // SELECT variants
    'SELECT': ['name', 'formControlName'],
    'MAT-SELECT': ['name', 'formControlName'],
    'TEXTAREA': ['name', 'formControlName']
    // INPUT-like and MAT-* inputs handled below via formInputTags
};

/**
 * Tags considered “INPUT-like”, sharing the same contextual attributes:
 * name, formControlName, value, placeholder.
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
 * ID formats:
 *   - `<TAG>__<context_or_text>__<8hexUUID>`
 *   - `<TAG>__<count>__<8hexUUID>`   (symbolic fallback)
 *
 * Generation priority:
 *   1. Contextual  – key attributes (e.g. name, value, placeholder)
 *   2. Binding     – Angular-bound props (only for `<form>`)
 *   3. Text-based  – button/anchor inner text
 *   4. Symbolic    – per-tag counter
 *
 * Call `resetCounters()` to clear per-tag symbolic counts between templates.
 */
export class WidgetIDGenerator {
    /** Tracks how many times each uppercase tag name has fallen back to symbolic. */
    private occurrences: Map<string, number> = new Map();

    /** The string used to separate parts of the ID. */
    readonly ID_SEPARATOR = '__';

    /**
     * Generate a unique ID for the given template element.
     *
     * @param widget  The AST element to generate an ID for.
     * @returns       A string like `BUTTON__save__a1b2c3d4`.
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
        if (!base && tag === 'FORM'){
            base = this._tryBinding(widget);
            if (base)
                logger.log('trace', '[WidgetIDGenerator] Binding base "%s" for FORM', base);
        }

        // 3) Text-based
        if (!base){
            base = this._tryText(widget);
            if (base)
                logger.log('trace', '[WidgetIDGenerator] Text base "%s" for %s', base, tag);
        }

        // 4) Symbolic fallback
        if (!base){
            base = this._symbolicBase(tag);
            logger.log('trace', '[WidgetIDGenerator] Symbolic fallback base "%s" for %s', base, tag);
        }

        // De-duplicate base within this template
        const count = (this.occurrences.get(base) || 0) + 1;
        this.occurrences.set(base, count);
        const uniqueBase = count === 1 ? base : `${base}${this.ID_SEPARATOR}${count}`;

        logger.debug('[WidgetIDGenerator] Final ID for %s → %s', tag, uniqueBase);
        return uniqueBase;
    }

    /**
     * Clears the per-base counters for symbolic de-duplication.
     */
    resetCounters(): void {
        this.occurrences.clear();
        logger.log('trace', '[WidgetIDGenerator] resetCounters() called, occurrences cleared');
    }

    /**
     * Generates an ID based on contextual attributes in priority order.
     *
     * Example:
     *   <input name="username">    →  `INPUT__username__c1a2b3d4-e5f6-...`
     *   <button value="save">      →  `BUTTON__save__a7b8c9d0-e1f2-...`
     *
     * @param widget      - The TmplAstElement to inspect.
     * @param attrs  - An array of attribute names to check, in priority order.
     * @returns           - A contextual ID (with UUID) or `undefined` if none of those attributes exist.
     */
    private _tryContextual(widget: TmplAstElement, attrs: string[]): string | undefined {
        for (const name of attrs) {
            const attr = widget.attributes.find((a) => a.name === name);
            if (attr?.value?.trim()) {
                // Sanitize: replace spaces or hyphens with underscore, then lowercase.
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
     * Generates an ID based on Angular property bindings (`[]` or `[()]` syntax).
     * 
     * Only invoked for `<form>`.
     *
     * Example:
     *   <form [formGroup]="userForm">   → `FORM__userForm__d4e5f6a7-...`
     *
     * @param widget - The TmplAstElement representing the FORM.
     * @returns      - A binding-based ID or `undefined` if no bound attribute found.
     */
    private _tryBinding(widget: TmplAstElement): string | undefined {
        for (const input of widget.inputs) {
            if (input instanceof TmplAstBoundAttribute) {
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
     * Generates an ID based on textual content, such as a button’s label or an anchor’s text.
     *
     * Example:
     *   <button>Submit</button>   → `BUTTON__submit__a1b2c3d4-...`
     *   <a>Learn More</a>         → `A__learn_more__b2c3d4e5-...`
     *
     * This method walks the entire subtree under `widget` to collect all `TmplAstText` nodes,
     * picks the single longest text, normalizes it (removes punctuation, replaces spaces, lowercases),
     * and then appends a short UUID (8 hex characters).
     *
     * @param widget - The TmplAstElement to inspect.
     * @returns      - A text-based ID or `undefined` if no meaningful text found.
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
            .replace(/^_+|_+$/g, "")  // remove leading/trailing underscores
            .toLowerCase();

        return this._composeWithShortUuid(widget.name, sanitized);
    }

    /**
     * Helper that recursively walks over a `TmplAstNode` and its children,
     * collecting all textual values from `TmplAstText` leaves.
     *
     * @param node     - The current AST node to inspect.
     * @param outTexts - An array to accumulate all text strings found.
     */
    private _collectTexts(node: TmplAstNode, outTexts: string[]): void {
        if (node instanceof TmplAstText)
            outTexts.push(node.value);

        // If it has children (e.g. elements), walk them as well
        // Here we rely on the fact that TmplAstElement has a `.children` array
        if (node instanceof TmplAstElement)
            for (const child of node.children)
                this._collectTexts(child, outTexts);
    }

    /**
     * Generates a fallback symbolic base ID when no contextual/binding/text information is available.
     * 
     * Returns only the widget tag name
     *
     * @param tag - The tag of the TmplAstElement to generate a fallback ID for.
     * @returns   - The tag of the element as a fallback symbolic ID
     */
    private _symbolicBase(tag: string): string {
        return tag;
    }

    /**
     * Helper to compose `<TAG>__<base>__<shortUuid>` using the first 8 hex digits of a v4.
     *
     * @param tag  - Tag name (e.g., 'BUTTON', 'INPUT', 'FORM').
     * @param base - Contextual/textual piece (already sanitized) or a numeric count as string.
     * @returns    - A string `<TAG>__<base>__<shortUuid>`
     */
    private _composeWithShortUuid(tag: string, base: string): string {
        // Grab only the first 8 hex digits of a v4
        const shortId = uuidv4().replace(/-/g, "").slice(0, 8);
        return `${tag}${this.ID_SEPARATOR}${base}${this.ID_SEPARATOR}${shortId}`;
    }
}