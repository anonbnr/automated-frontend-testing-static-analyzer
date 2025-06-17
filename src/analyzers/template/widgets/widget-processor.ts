// ──────────────────────────────────────────────────────────────────────────────
// widget-processor.ts
//
// A `WidgetProcessor` that recursively traverses an Angular template AST
// to extract **all** interactive widgets in a hierarchy (or flattenable tree).
//
// Responsibilities:
//   - Assign unique IDs (via `WidgetIDGenerator`) when no `id` attribute exists.
//   - Collect raw attributes, validation-rule flags, event handlers, and submission triggers.
//   - Recursively descend into every element (and `<ng-template>`) so no widget is missed.
// ──────────────────────────────────────────────────────────────────────────────

import { AST, TmplAstElement, TmplAstNode, TmplAstTemplate } from "@angular/compiler";
import { NavEventType, UserEventType } from "../../../models/event-info.js";
import { WidgetInfo } from "../../../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";

/**
 * Processes an Angular template to extract **interactive widgets**.
 *
 * It does a level-based scan:
 *  - Phase 1: find “first-level” widgets (forms, anchors, etc.)
 *  - Phase 2: within *each* first-level element, scan for actual controls (buttons, inputs…)
 *  - (Optionally Phase 3: deeper controls under those, e.g. mat-option under mat-select)
 *
 * The result is a tree of `WidgetInfo`, each with an optional `children: WidgetInfo[]`.
 */
export class WidgetProcessor {
    private _idGen = new WidgetIDGenerator();
    private _widgetTags = new Set([
        // HTML controls
        "button", "input", "option", "select", "textarea", "form", "a",
        // Material (and any custom) widgets we care about
        "mat-button", "mat-icon-button", "mat-select", "mat-checkbox",
        "mat-button-toggle-group", "mat-button-toggle",
        "mat-radio-group", "mat-radio-button",
        "mat-option", "mat-datepicker-toggle",
        // …add any others here
    ]);
    private _validationRules = ['required', 'pattern', 'min', 'max', 'minLength', 'maxLength'];

    /**
     * Creates a new widget processor for the provided 
     * raw HTML/Angular template text
     */
    constructor(private templateSource: string) { }

    /**
     * Traverse the AST and extract widgets in a recursive hierarchical scan
     *
     * @param nodes
     *   The top-level AST nodes.
     * @returns
     *   A tree of `WidgetInfo`, each with optional `children: WidgetInfo[]`.
     */
    processWidgets(nodes: TmplAstNode[]): WidgetInfo[] {
        return this._scanTemplateAST(nodes);
    }

    /**
     * Recursively scans a mixed array of AST nodes.
     * Builds a WidgetInfo for each “interactive” element, and always recurses.
     */
    private _scanTemplateAST(nodes: TmplAstNode[]): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];

        for (const node of nodes) {
            if (node instanceof TmplAstElement) {
                // Recurse first into children so nested widgets are discovered
                const children = this._scanTemplateAST(node.children);

                // If this element qualifies as a widget, build an entry
                if (this._isInteractive(node)) {
                    const w: WidgetInfo = this._buildWidgetInfo(node);
                    w.children = children;
                    widgets.push(w);
                } else {
                    // If this element itself isn’t a widget, bubble up its children
                    widgets.push(...children);
                }
            }
            else if (node instanceof TmplAstTemplate) {
                // Structural directives (<ng-template / *ngIf / *ngFor>)
                widgets.push(...this._scanTemplateAST(node.children));
            }
            // other node types (text, bound text…) are ignored
        }

        return widgets;
    }

    /**
     * Heuristic for whether an element is “interactive”:
     * - Its tag is in our widgetTags set
     * - Or it has any Angular output (click, submit, change, etc.)
     * - Or it has a routerLink input
     */
    private _isInteractive(el: TmplAstElement): boolean {
        return this._widgetTags.has(el.name.toLowerCase())
            || el.outputs.length > 0
            || el.inputs.some(i => i.name === "routerLink")
    }

    /**
     * @TODO update documentation and comments similar to previous modules
     * Builds a `WidgetInfo` for a single `TmplAstElement`.
     *
     * Steps:
     *   1) Determine/generate `id`
     *   2) Collect all raw attributes into `attributes: Record<string, any>`
     *   3) Detect built-in validation rules (`required`, `pattern`, `min`, `max`)
     *   4) Extract any Angular outputs (e.g. `(click)="onDo()"`) into `events[...]`
     *   5) Extract routerLink/href into `events["routerLink"]` or `events["href"]`
     *   6) Mark `triggersFormSubmission` if this element will submit a form:
     *      - `<button type="submit">`
     *      - `<input type="submit">`
     *      - `<input type="image">`
     *      - (Optionally) any other custom “submit-like” control to include
     */
    private _buildWidgetInfo(el: TmplAstElement): WidgetInfo {
        // Collect raw attributes
        const attributes = this._collectAttributes(el);

        return {
            // ID: if literal id="..." exists, use that; otherwise generate
            id: this._getID(el, attributes),
            // Type: tag
            type: el.name.toLowerCase(),
            // Raw attributes
            attributes,
            // Events (outputs + routerLink/href)
            events: this._collectEvents(el, attributes),
            // Validation rules by attribute presence
            validationRules: this._detectValidationRules(attributes),
            // Form submission triggering status
            triggersFormSubmission: this._detectFormSubmission(el, attributes),
            // Children
            children: [] // will be filled in by the caller
        };
    }

    /**
     * Gathers all raw attributes (name → value) from `widget.attributes`.
     * Also ensures `<input>` has a default type of "text" if unspecified.
     */
    private _collectAttributes(el: TmplAstElement): Record<string, any> {
        const attributes: Record<string, any> = {};

        for (const attr of el.attributes)
            attributes[attr.name] = attr.value;

        if (el.name.toLowerCase() === "input" && attributes.type == null)
            attributes.type = "text";

        return attributes;
    }

    /**
     * @TODO update documentation and comments similar to previous modules
     * Returns either the existing id="..." attribute value, or calls
     * `idGenerator.generateID(widget)` if none was provided.
     */
    private _getID(el: TmplAstElement, attrs: Record<string, any>): string {
        if (attrs.id?.trim())
            return attrs.id;
        return this._idGen.generateID(el);
    }

    /**
     * @TODO update documentation and comments similar to previous modules
     * Extracts all relevant events for a widget, returning a map:
     *   {  
     *     // Router‐style
     *     routerLink?: "/path",  
     *     href?: "http://..."  
     *     // Angular outputs (click, submit, input, change, or custom)
     *     [outputName]: handlerName  
     *   }
     *
     * 1) If `[routerLink]` or `routerLink` exists, store under "routerLink".
     * 2) If `href` attribute exists on <a>, store under "href".
     * 3) For every `node.outputs`, slice out the handler name via `_extractHandler(...)`.
     */
    private _collectEvents(el: TmplAstElement, attrs: Record<string, any>):
        Record<UserEventType | NavEventType, string> {
        const events: Record<UserEventType | NavEventType, string> = {};

        // 1a) Bound routerLink
        const rlBound = el.inputs.find(i => i.name === "routerLink");
        if (rlBound)
            events.routerLink = this._normalizeLink(rlBound.value.toString());
        // 1b) Literal routerLink attr (no brackets)
        else if (attrs.routerLink)
            events.routerLink = this._normalizeLink(attrs.routerLink);

        // 2) href for <a>
        if (el.name.toLowerCase() === "a" && attrs.href)
            events.href = attrs.href;

        // 3) all other outputs: (click), (submit), (input), (change), or custom
        for (const output of el.outputs)
            events[output.name] = this._extractHandler(output.handler);

        return events;
    }

    /** Strip interpolation and quotes, same logic as before */
    private _normalizeLink(raw: string): string {
        let v = raw.trim();

        // Strip out any mustache interpolation
        // e.g. "/owners/{{owner.id}}" → "/owners/:id"
        const interpolateRegex = /\{\{\s*([\w$\.]+)\s*\}\}/g;
        v = v.replace(interpolateRegex, (_, expr) => {
            // take the last segment as the param name
            const parts = expr.split(".");
            const paramName = parts[parts.length - 1];
            return `:${paramName}`;
        });

        // Strip quotes
        const m = v.match(/'([^']+)'/);
        if (m)
            v = m[1];

        // Strip inline@ suffix
        v = v.split(" in inline@")[0];
        return v;
    }

    /**
     * Scans `attributes` for standard validation‐rule presence and returns an array:
     *   - "required" if `required` in attributes
     *   - "pattern" if `pattern` in attributes
     *   - "min" if `min` in attributes
     *   - "max" if `max` in attributes
     */
    private _detectValidationRules(attributes: Record<string, any>): string[] {
        const rules: string[] = [];

        for (const targetRule of this._validationRules)
            if (targetRule in attributes)
                rules.push(targetRule);

        return rules;
    }

    /**
     * Given an AST node for an event handler (e.g. the AST behind `(click)="onSave()"`),
     * pull out the **text snippet** from the original template that corresponds to the handler name.
     *
     * We use `handler.sourceSpan.start`/`.end` to cut out exactly “onSave” (no trailing “()”).
     *
     * @param handler
     *   The AST representing the event‐handler expression. Under the hood, this has a `sourceSpan`
     *   with `{ start, end }` indices into `this.templateSource`.
     * @returns
     *   The handler’s name string, e.g. “onSave” (with parentheses stripped).
     */
    private _extractHandler(handler: AST): string {
        // Use `start` and `end` from `sourceSpan` to extract the corresponding code snippet
        const { start, end } = handler.sourceSpan;
        // Slice from the template’s original text, then strip out trailing "()"
        return this.templateSource.slice(start, end)
            .replace(/\(\)\s*$/, "") // Normalization
            .trim();
    }

    /**
     * Detects whether this element should trigger form submission:
     *   - `<button type="submit">`
     *   - `<input type="submit">`
     *   - `<input type="image">`
     *   - (any custom “submit-like” tags must be added here if needed)
     */
    private _detectFormSubmission(el: TmplAstElement, attrs: Record<string, any>): boolean {
        const tag = el.name.toLowerCase();
        const type = (attrs.type || "").toLowerCase();

        return (tag === "button" && type === "submit") // a) <button type="submit">
            || (tag === "input" && (type === "submit" || type === "image")) // b) <input type="submit"> or <input type="image">
            || (tag === "mat-button" && type === "submit"); // c) (other custom “submit” tags—e.g. a third‐party component—check here)
    }
}