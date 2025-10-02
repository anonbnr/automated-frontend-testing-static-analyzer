// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/widgets/widget-processor.ts
//
// Traverses an Angular template AST to extract **all** interactive widgets.
//   - Assigns unique IDs (via WidgetIDGenerator) when no `id` attribute exists
//   - Collects raw attributes, validation-rule flags, event handlers, submission triggers
//   - Recursively descends into every element and `<ng-template>` so no widget is missed
// ──────────────────────────────────────────────────────────────────────────────

import { AST, TmplAstElement, TmplAstNode, TmplAstTemplate } from "@angular/compiler";
import { NavEventType, UserEventType } from "../../../models/event-info.js";
import { WidgetInfo } from "../../../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";
import logger from "../../../logging/logger.js";
import { WidgetUtils } from "./widget-utils.js";

/**
 * Recursively scans an Angular template AST to build a hierarchy of interactive widgets.
 *
 * Scan phases:
 *   1. Top-level “containers” (forms, anchors, etc.)
 *   2. Controls within containers (buttons, inputs, selects, etc.)
 *   3. Deeper nested controls (e.g. `<mat-option>` inside `<mat-select>`)
 *
 * Each `WidgetInfo` includes:
 *   - `id`: unique identifier (namespace + generated ID)
 *   - `type`: HTML or component tag name
 *   - `attributes`: raw attribute map
 *   - `events`: map of eventName → handlerName
 *   - `validationRules`: list of HTML/form validations
 *   - `triggersFormSubmission`: boolean flag
 *   - `children`: nested WidgetInfo[]
 *   - `originalNode`: original AST element of the widget
 */
export class WidgetProcessor {
    private _idGen = new WidgetIDGenerator();
    private _widgetTags = WidgetUtils.WIDGET_TAGS;
    private _validationRules = WidgetUtils.VALIDATION_RULES;

    /**
     * Creates a new widget processor for the provided 
     * raw HTML/Angular template text
     * 
     * @param templateSource   The raw template text (used to extract event-handler source spans).
     */
    constructor(private templateSource: string) { }

    /**
     * Extracts all interactive widgets from the AST, namespaced by the component selector.
     *
     * @param nodes      The top-level AST nodes from AngularTemplateParser.
     * @param namespace  The component’s selector or class name (prepended to each widget ID).
     * @returns          A tree of WidgetInfo, each with zero or more children.
     */
    processWidgets(nodes: TmplAstNode[], namespace: string): WidgetInfo[] {
        logger.info('[WidgetProcessor] Starting widget extraction for namespace="%s"', namespace);
        this._idGen.resetCounters();

        const widgets = this._scanTemplateAST(nodes, namespace);
        logger.info('[WidgetProcessor] Completed extraction: found %d widgets in "%s"', widgets.length, namespace);
        return widgets;
    }

    /**
     * Recursively visits AST nodes, collecting widgets and descending into children.
     *
     * @param nodes      AST nodes to scan.
     * @param namespace  Component namespace for ID generation.
     * @returns          Flattened list of WidgetInfo trees.
     */
    private _scanTemplateAST(nodes: TmplAstNode[], namespace: string): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];

        for (const node of nodes) {
            if (node instanceof TmplAstElement) {
                // Recurse first into children so nested widgets are discovered
                const children = this._scanTemplateAST(node.children, namespace);

                // If this element qualifies as a widget, build an entry
                if (this._isInteractive(node)) {
                    const w = this._buildWidgetInfo(node, namespace);
                    w.children = children;
                    widgets.push(w);
                } else {
                    // If this element itself isn’t a widget, bubble up its children
                    widgets.push(...children);
                }
            }
            else if (node instanceof TmplAstTemplate) {
                // Structural directives (*ngIf, *ngFor, ng-template, etc.)
                widgets.push(...this._scanTemplateAST(node.children, namespace));
            }
            // other node types (text, bound text…) are ignored
        }

        return widgets;
    }

    /**
     * Determines if an element is “interactive”:
     *   - Tag is in the set of known widget tags
     *   - Has any Angular outputs (click, submit, etc.)
     *   - Has a routerLink input
     *
     * Skips `<app-*>` elements with no outputs or routerLink.
     */
    private _isInteractive(el: TmplAstElement): boolean {
        // 1) Only skip app-* if it truly has no user-visible events on it
        const tag = el.name.toLowerCase();
        if (tag.startsWith('app-')
            && el.outputs.length === 0
            && !el.inputs.some(i => i.name === "routerLink"))
            return false;

        // 2) otherwise use widget heuristics
        return this._widgetTags.has(tag)
            || el.outputs.length > 0
            || el.inputs.some(i => i.name === "routerLink")
    }

    /**
     * Builds a WidgetInfo for a single AST element.
     *
     * @param el         The AST element.
     * @param namespace  Component namespace for ID prefixing.
     * @returns          A populated WidgetInfo (children assigned by caller).
     */
    private _buildWidgetInfo(el: TmplAstElement, namespace: string): WidgetInfo {
        // Original AST node
        const originalNode = el;

        // Collect Attributes
        const attributes = this._collectAttributes(el);

        // Retrieve/Generate ID
        const id = this._getID(el, attributes, namespace);

        // Extract Type: tag of the widget
        const type = WidgetUtils.resolveWidgetType(el.name, attributes);

        // Collect Events (outputs + routerLink/href)
        const events = this._collectEvents(el, attributes);

        // Detect Validation Rules by attribute presence
        const validationRules = this._detectValidationRules(attributes);

        // Detect Form submission triggering status
        const triggersFormSubmission = this._detectFormSubmission(el, attributes);

        const widget: WidgetInfo = {
            id,
            type,
            attributes,
            events,
            validationRules,
            triggersFormSubmission,
            // originalNode,
            children: [], // will be filled in by the caller
        };

        logger.debug('[WidgetProcessor] Built widget ID="%s", type="%s"', id, type);
        return widget;
    }

    /**
     * Gathers raw attribute name → value pairs from an element.
     * Ensures <input> has type="text" if none specified.
     */
    private _collectAttributes(el: TmplAstElement): Record<string, any> {
        const attributes: Record<string, any> = {};

        for (const attr of el.attributes)
            attributes[attr.name] = attr.value;

        if (el.name.toLowerCase() === "input" && !attributes.type)
            attributes.type = "text";

        return attributes;
    }

    /**
     * Retrieves the existing ID of the element based on its attributes.
     * Otherwise, generates a new ID if no ID attribute is already available.
     * 
     * Contextualizes the returned ID based on the namespace
     * @param el            The AST element.
     * @param attrs         The HTML attributes of the element
     * @param namespace     Component namespace for ID prefixing.
     * @returns             The namespace-contextualized (retrieved or generated) ID of the widget
     */
    private _getID(el: TmplAstElement, attrs: Record<string, any>, namespace: string): string {
        // Check if the element already has an ID
        // If not, generate a unique ID for it using the widget ID generator
        const id: string = attrs.id?.trim() || this._idGen.generateID(el);

        // Add namespace contextualization to the ID before returning it
        return `${namespace}${this._idGen.ID_SEPARATOR}${id}`;
    }

    /**
     * Extracts event bindings and routerLink/href into a map:
     *   { routerLink?: string, href?: string, [outputName]: handlerName }
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

    /** Cleans up routerLink/href values, stripping interpolation and quotes. */
    private _normalizeLink(raw: string): string {
        let v = raw.trim();

        // Strip out any mustache interpolation
        // e.g. "/owners/{{owner.id}}" → "/owners/:id"
        const interp = /\{\{\s*([\w$\.]+)\s*\}\}/g;
        v = v.replace(interp, (_, expr) => `:${expr.split('.').pop()}`);

        // Strip quotes
        const m = v.match(/'([^']+)'/);
        if (m)
            v = m[1];

        // Strip inline@ suffix
        return v.split(" in inline@")[0];
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
        return this.templateSource
            .slice(start, end)
            .replace(/\(\)\s*$/, "") // Normalization
            .trim();
    }

    /** Gathers all standard validation rules present in the attribute map. */
    private _detectValidationRules(attributes: Record<string, any>): string[] {
        return this._validationRules.filter(r => r in attributes);
    }

    /** Determines if an element should trigger form submission. */
    private _detectFormSubmission(el: TmplAstElement, attrs: Record<string, any>): boolean {
        const tag = el.name.toLowerCase();
        const type = (attrs.type || "").toLowerCase();

        return (tag === "button" && type === "submit") // a) <button type="submit">
            || (tag === "input" && ["submit", "image"].includes(type)) // b) <input type="submit"> or <input type="image">
            || (tag === "mat-button" && type === "submit"); // c) (other custom “submit” tags—e.g. a third‐party component—check here)
    }
}