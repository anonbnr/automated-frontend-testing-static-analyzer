// ──────────────────────────────────────────────────────────────────────────────
// widget-id-generator.ts
//
// A WidgetIDGenerator module that:
//   1) Provides a centralized class for generating unique IDs for template widgets
//      in Angular templates.
//   2) Supports four ID-generation strategies, in priority order:
//        - Contextual ID: uses meaningful attributes (e.g., `name`, `formControlName`, `value`, `placeholder`)
//        - Binding-based ID: uses Angular-bound properties (e.g., `[formGroup]`, `[routerLink]`) — only for FORM tags
//        - Default/text-based ID: uses the widget’s text content (e.g., button label)
//        - Symbolic ID: a fallback counter per widget type, with a UUID suffix to guarantee uniqueness
//   3) Ensures ID uniqueness by appending a short UUID v4 to any ID containing a context or when falling back.
//
// To add or tweak which attributes are considered “contextual” for a given tag, update the
// `CONTEXTUAL_ATTRS_BY_TAG` map below—no need to alter algorithm in `generateID()`.
//
// Example attribute mappings (all uppercase tag names):
//   BUTTON     → [ 'name', 'value', 'formControlName' ]
//   A          → [ 'routerLink', 'href', 'name', 'formControlName', 'value' ]
//   INPUT      → [ 'name', 'formControlName', 'value', 'placeholder' ]
//   MAT-SELECT → [ 'name', 'formControlName' ]
//   TEXTAREA   → [ 'name', 'formControlName' ]
//   MAT-CHECKBOX, etc. will use same as INPUT (handled via a simple rule below).
// ──────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';

import { TmplAstBoundAttribute, TmplAstElement, TmplAstNode, TmplAstText } from "@angular/compiler";

/**
 * A lookup of “contextual attribute names” keyed by uppercase tag name.
 * If a tag appears here, `generateContextualID` will check its listed attributes in order.
 * If the tag is not a direct key but is considered an “alias” (e.g. custom “MAT-…” tags),
 * it falls back to the INPUT-like attributes (see code below).
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
 * Tags that behave like “INPUT” (i.e. checkbox, radio, toggle, etc.).
 * They all share the same contextual attributes: name/formControlName/value/placeholder.
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
 * Generates **unique identifiers (IDs)** for widgets in Angular templates.
 *
 * Each generated ID follows one of two formats:
 *   - `<WIDGET>__<context_or_text>__<UUID>`    (if context or text is found)
 *   - `<WIDGET>__<count>__<UUID>`                (fallback symbolic ID with UUID)
 *
 * Priority order for generating IDs:
 *   1. Contextual ID    – checks attributes (e.g. `name`, `formControlName`, `value`, `placeholder`)
 *   2. Binding-based ID – checks Angular-bound properties (`[]` or `[()]`) **only for `<form>` tags**
 *   3. Default/text ID  – inspects the element’s inner text nodes (e.g., button or anchor text)
 *   4. Symbolic ID      – a simple `<WIDGET>__<n>__<UUID>` counter if no other context is found
 *
 * To avoid collisions, every ID (whether contextual or symbolic) gets a v4 UUID appended.
 * If you need to clear counts between parsing multiple templates, call `resetCounters()`.
 */
export class WidgetIDGenerator {
    /** Tracks how many times each uppercase tag name has fallen back to symbolic. */
    private occurrences: Map<string, number> = new Map();

    /** The string used to separate parts of the ID. */
    private readonly ID_SEPARATOR = '__';

    /**
     * Generates a **unique widget ID** for the given Angular template element.
     *
     * @param widget - The Angular template widget element (TmplAstElement).
     * @returns     - A unique string ID, guaranteed not to collide (due to appended UUID).
     */
    generateID(widget: TmplAstElement): string {
        const tag = widget.name.toUpperCase();

        // 1) Try contextual attributes, if defined for this tag or it’s input-like
        let id: string | null = null;
        if (INPUT_LIKE_TAGS.has(tag)) {
            // All INPUT-like tags share the same attribute list:
            id = this._generateContextualID(widget, ['name', 'formControlName', 'value', 'placeholder']);
        }
        else if (CONTEXTUAL_ATTRS_BY_TAG[tag])
            id = this._generateContextualID(widget, CONTEXTUAL_ATTRS_BY_TAG[tag]);

        // 2) If still none, but tag == FORM, try binding-based ID
        if (!id && tag === 'FORM')
            id = this._generateBindingID(widget);

        // 3) If still none, try default/text-based ID
        if (!id)
            id = this._generateDefaultID(widget);

        // 4) If still none, fallback to symbolic ID
        if (!id)
            id = this._generateSymbolicID(widget);

        return id;
    }

    /**
     * Clears all per-widget-type counters. Call this before parsing a new template file
     * if you want symbolic IDs to restart at 1 per tag in each template.
     */
    resetCounters(): void {
        this.occurrences.clear();
    }

    /**
     * Generates an ID **based on meaningful attributes** (e.g., `name`, `value`, `formControlName`, `placeholder`).
     *
     * Example:
     *   <input name="username">    →  `INPUT__username__c1a2b3d4-e5f6-...`
     *   <button value="save">      →  `BUTTON__save__a7b8c9d0-e1f2-...`
     *
     * @param widget      - The TmplAstElement to inspect.
     * @param attributes  - An array of attribute names to check, in priority order.
     * @returns           - A contextual ID (with UUID) or `null` if none of those attributes exist.
     */
    private _generateContextualID(widget: TmplAstElement, attributes: string[]): string | null {
        for (const attrName of attributes) {
            const attr = widget.attributes.find((a) => a.name === attrName);
            if (attr?.value?.trim()) {
                // Sanitize: replace spaces or hyphens with underscore, then lowercase.
                const sanitized = attr.value
                    .trim()
                    .replace(/[\s\-]+/g, "_")
                    .toLowerCase();
                return this._composeWithUuid(widget.name, sanitized);
            }
        }
        return null;
    }

    /**
     * Generates an ID **based on Angular property bindings** (`[]` or `[()]` syntax).
     *
     * Example:
     *   <form [formGroup]="userForm">   → `FORM__userForm__d4e5f6a7-...`
     *
     * Only invoked when tag === 'FORM'.
     *
     * @param widget - The TmplAstElement representing the FORM.
     * @returns      - A binding-based ID or `null` if no bound attribute found.
     */
    private _generateBindingID(widget: TmplAstElement): string | null {
        for (const input of widget.inputs) {
            if (input instanceof TmplAstBoundAttribute) {
                const rawValue = input.value
                    .toString()
                    .split(/\s+/)[0]
                    .trim();
                if (rawValue)
                    return this._composeWithUuid(widget.name, rawValue);
            }
        }

        return null;
    }

    /**
     * Generates an ID **based on textual content**, such as a button’s label or an anchor’s text.
     *
     * Example:
     *   <button>Submit</button>   → `BUTTON__submit__a1b2c3d4-...`
     *   <a>Learn More</a>         → `A__learn_more__b2c3d4e5-...`
     *
     * This method walks the entire subtree under `widget` to collect all `TmplAstText` nodes,
     * picks the single longest text, normalizes it (removes punctuation, replaces spaces, lowercases),
     * and then appends a UUID.
     *
     * @param widget - The TmplAstElement to inspect.
     * @returns      - A text-based ID or `null` if no meaningful text found.
     */
    private _generateDefaultID(widget: TmplAstElement): string | null {
        // 1) Recursively collect all TmplAstText node values
        const allTexts: string[] = [];
        this._collectAllText(widget, allTexts);

        // 2) Pick the longest text (if any)
        let longestText = "";
        for (const txt of allTexts) {
            const trimmed = txt.trim();
            if (trimmed.length > longestText.length)
                longestText = trimmed;
        }

        if (longestText) {
            // Replace any sequence of non-alphanumeric characters with underscore, then lowercase.
            const sanitized = longestText
                .replace(/[^A-Za-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")  // remove leading/trailing underscores
                .toLowerCase();
            return this._composeWithUuid(widget.name, sanitized);
        }

        return null;
    }

    /**
     * Helper that recursively walks over a `TmplAstNode` and its children,
     * collecting all textual values from `TmplAstText` leaves.
     *
     * @param node     - The current AST node to inspect.
     * @param outTexts - An array to accumulate all text strings found.
     */
    private _collectAllText(node: TmplAstNode, outTexts: string[]): void {
        if (node instanceof TmplAstText)
            outTexts.push(node.value);

        // If it has children (e.g. elements), walk them as well
        // Here we rely on the fact that TmplAstElement has a `.children` array
        if (node instanceof TmplAstElement)
            for (const child of node.children)
                this._collectAllText(child, outTexts);

        // Note: if we later introduce other node types with text children,
        // extend this method to dive into those as well.
    }

    /**
     * Generates a **fallback symbolic ID** when no contextual/binding/text information is available.
     *
     * Example (counter starts at 1 for each tag):
     *   <button>    →  `BUTTON__1__c1a2b3d4-...`
     *   <input>     →  `INPUT__2__d4e5f6a7-...`
     *
     * Automatically appends a UUID v4 to ensure global uniqueness.
     *
     * @param widget - The TmplAstElement to generate a fallback ID for.
     * @returns      - A symbolic ID: `<TAG>__<count>__<UUID>`.
     */
    private _generateSymbolicID(widget: TmplAstElement): string {
        const tag = widget.name.toUpperCase();
        const previous = this.occurrences.get(tag) || 0;
        const current = previous + 1;
        this.occurrences.set(tag, current);

        // Always append UUID for guaranteed uniqueness
        return this._composeWithUuid(tag, current.toString());
    }

    /**
     * Helper to build an ID string of the form `<TAG>__<base>__<UUID>`.
     *
     * @param tag  - Tag name (e.g., 'BUTTON', 'INPUT', 'FORM').
     * @param base - Contextual/textual piece (already sanitized) or a numeric count as string.
     * @returns    - A string `<TAG>__<base>__<UUID>`.
     */
    private _composeWithUuid(tag: string, base: string): string {
        const uuid = uuidv4();
        return `${tag}${this.ID_SEPARATOR}${base}${this.ID_SEPARATOR}${uuid}`;
    }
}