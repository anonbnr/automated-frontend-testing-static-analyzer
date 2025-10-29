// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/widgets/widget-processor.ts
//
// Purpose
//   Traverse an Angular template AST to extract **all** interactive widgets.
//   For each qualifying element, capture:
//     • stable ID (existing `id` attr or generated via WidgetIDGenerator, namespaced)
//     • tag-derived/resolved `type`
//     • raw attributes map
//     • normalized event bindings (DOM + navigation)
//     • validation rule flags
//     • whether it triggers form submission
//     • hierarchical children (full subtree)
//     • original AST node (traceability)
//
// Detection heuristics
//   • A node is “interactive” if:
//       - its tag is in WidgetUtils.WIDGET_TAGS, OR
//       - it declares any outputs (e.g., (click)), OR
//       - it has a routerLink input
//     Exception: skip bare `<app-*>` elements with no outputs and no routerLink.
//   • Recurses into `<ng-template>` / structural directives so nothing is missed.
//
// Notes
//   • IDs are namespaced with the `namespace` argument: "<ns>__<local-id>".
//   • Callers should pass the *original* template source to enable precise
//     extraction of handler names from source spans.
// ──────────────────────────────────────────────────────────────────────────────

import { AST, TmplAstElement, TmplAstNode, TmplAstTemplate } from "@angular/compiler";
import logger from "../../../logging/logger.js";
import { NavEventType, UserEventType } from "../../../models/event-info.js";
import { WidgetInfo } from "../../../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";
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
    * @param templateSource Raw template text (used to slice handler names via source spans).
    */
    constructor(private templateSource: string) { }

    /**
    * Extract all interactive widgets from the template AST, namespaced by component.
    *
    * @param nodes     Top-level AST nodes from the Angular template parser.
    * @param namespace Component selector or class name; prefixed to widget IDs.
    * @returns         A forest of WidgetInfo roots (each with `children`).
    */
    processWidgets(nodes: TmplAstNode[], namespace: string): WidgetInfo[] {
        logger.info('[WidgetProcessor] Starting widget extraction for namespace="%s"', namespace);
        this._idGen.resetCounters();

        const widgets = this._scanTemplateAST(nodes, namespace);
        logger.info('[WidgetProcessor] Completed extraction: found %d widgets in "%s"', widgets.length, namespace);
        return widgets;
    }

    /**
    * DFS over AST nodes, collecting widgets and descending into children/templates.
    */
    private _scanTemplateAST(nodes: TmplAstNode[], namespace: string): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];

        for (const node of nodes) {
            if (node instanceof TmplAstElement) {
                // Recurse first so child widgets are discovered regardless of parent classification.
                const children = this._scanTemplateAST(node.children, namespace);

                // If this element qualifies as a widget, build an entry
                if (this._isInteractive(node)) {
                    const w = this._buildWidgetInfo(node, namespace);
                    w.children = children;
                    widgets.push(w);
                } else {
                    // Bubble up any interactive children under a non-interactive container.
                    widgets.push(...children);
                }
            }
            else if (node instanceof TmplAstTemplate) {
                // Structural directives (*ngIf, *ngFor, <ng-template>, etc.)
                widgets.push(...this._scanTemplateAST(node.children, namespace));
            }
            // Other nodes (text, bound text, etc.) are ignored for widget purposes.
        }

        return widgets;
    }

    /**
    * Returns true if an element is considered “interactive”.
    *
    * Rules:
    *   • Skip bare <app-*> elements with no outputs and no routerLink.
    *   • Otherwise, interactive if:
    *       - tag in known widget tags OR
    *       - any outputs exist OR
    *       - any `routerLink` input is present
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
    * Build a WidgetInfo for a single interactive element.
    * Children are assigned by the caller.
    */
    private _buildWidgetInfo(el: TmplAstElement, namespace: string): WidgetInfo {
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
            // originalNode: el,
            children: [], // filled by caller
        };

        logger.debug('[WidgetProcessor] Built widget ID="%s", type="%s"', id, type);
        return widget;
    }

    /**
    * Collect raw attribute name → value pairs from an element.
    * Ensures `<input>` defaults to type="text" if unspecified.
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
    * Retrieve an existing `id` attribute if present; otherwise generate one.
    * Always namespaces the result as: "<namespace>__<local-id>".
    */
    private _getID(el: TmplAstElement, attrs: Record<string, any>, namespace: string): string {
        // Check if the element already has an ID
        // If not, generate a unique ID for it using the widget ID generator
        const id: string = attrs.id?.trim() || this._idGen.generateID(el);

        // Add namespace contextualization to the ID before returning it
        return `${namespace}${this._idGen.ID_SEPARATOR}${id}`;
    }

    /**
    * Extract event bindings into a normalized map:
    *   { routerLink?: string, href?: string, [outputName]: handlerName }
    */
    private _collectEvents(el: TmplAstElement, attrs: Record<string, any>):
        Record<UserEventType | NavEventType, string> {
        const events: Record<UserEventType | NavEventType, string> = {};

        // 1a) Bound routerLink
        const rlBound = el.inputs.find(i => i.name === "routerLink");
        if (rlBound)
            events.routerLink = this._normalizeLink(rlBound.value.toString());
        // 1b) Literal routerLink (no brackets)
        else if (attrs.routerLink)
            events.routerLink = this._normalizeLink(attrs.routerLink);

        // 2) href for anchors
        if (el.name.toLowerCase() === "a" && attrs.href)
            events.href = attrs.href;

        // 3) Outputs: (click), (submit), (input), (change), custom…
        for (const output of el.outputs)
            events[output.name] = this._extractHandler(output.handler);

        return events;
    }

    /** Normalize routerLink/href-like values: strip interpolation, quotes, and inline suffixes. */
    private _normalizeLink(raw: string): string {
        let v = raw.trim();

        // Replace simple mustache interpolation with :param (best-effort)
        // e.g., "/owners/{{owner.id}}" → "/owners/:id"
        const interp = /\{\{\s*([\w$\.]+)\s*\}\}/g;
        v = v.replace(interp, (_, expr) => `:${expr.split('.').pop()}`);

        // Strip single quotes around string literals
        const m = v.match(/'([^']+)'/);
        if (m)
            v = m[1];

        // Remove Angular "inline@" artifacts if present
        return v.split(" in inline@")[0];
    }

    /**
    * Extract the handler name from an event expression AST.
    * Prefers `sourceSpan.{start.offset,end.offset}`; falls back to a regex on
    * `toString()` if offsets are not available.
    */
    private _extractHandler(handler: AST): string {
        // Angular AST usually exposes start/end offsets for precise slicing.
        const { start, end } = handler.sourceSpan;

        if (Number.isFinite(start) && Number.isFinite(end)) {
            // Slice from the template's original text, then strip out trailing "()"
            return this.templateSource
                .slice(start as number, end as number)
                .replace(/\(\)\s*$/, '')
                .trim();
        }

        // Fallback: try to grab the leading identifier from a string form.
        const text = String(handler);
        const m = text.match(/[A-Za-z_]\w*/);
        return m ? m[0] : text.trim();
    }

    /** Return the list of known validation rules present on the attributes. */
    private _detectValidationRules(attributes: Record<string, any>): string[] {
        return this._validationRules.filter(r => r in attributes);
    }

    /**
    * Determine if an element triggers form submission.
    * Matches common native and Material patterns.
    */
    private _detectFormSubmission(el: TmplAstElement, attrs: Record<string, any>): boolean {
        const tag = el.name.toLowerCase();
        const type = (attrs.type || "").toLowerCase();

        return (tag === "button" && type === "submit") // <button type="submit">
            || (tag === "input" && ["submit", "image"].includes(type)) // <input type="submit|image">
            || (tag === "mat-button" && type === "submit"); // e.g., third-party/MDC submit facades
    }
}