// ──────────────────────────────────────────────────────────────────────────────
// logic-analyzer.ts
//
// Analyzes the **business logic** of Angular components, either individually
// or across an entire Project. For each interactive widget, it:
//
//   1. Wires up declared UI events to component methods.
//   2. Extracts all router navigations (`router.navigate`) and service calls.
//   3. Resolves dynamic route paths (matching `RouteMap` entries).
//   4. Pulls form validation rules from `formBuilder.group(...)`.
//   5. Attaches those validation rules back onto the corresponding widgets.
//
// Exposes two entry points:
//   - `analyze(file, widgets, routeMap): WidgetEventMap[]`
//       Analyze one component `.ts` file’s widgets.
//   - `analyzeProject(project, registry, routeMap): WidgetEventMap[]`
//       Discover and analyze *all* components in a `ts-morph` Project.
//
// Depends on:
//   - `LogicUtils`     (finding primary `@Component` classes, selectors)  
//   - `TemplateUtils`  (flattening widget hierarchies)  
//   - `ts-morph`       (AST traversal)  
//   - `RouteMap`       (for dynamic-route resolution)  
//   - `ComponentRegistry` (template-derived metadata)  
// ──────────────────────────────────────────────────────────────────────────────

import { ArrayLiteralExpression, CallExpression, ClassDeclaration, ConstructorDeclaration, MethodDeclaration, ObjectLiteralExpression, Project, SourceFile, SyntaxKind } from 'ts-morph';
import { ComponentRegistry } from '../../models/component-info.js';
import { EventContext, EventHandlerCallContext, WidgetEventMap } from '../../models/event-info.js';
import { RouteMap } from '../../models/route-info.js';
import { WidgetInfo } from '../../models/widget-info.js';
import { LogicUtils } from './logic-utils.js';
import { TemplateUtils } from '../template/template-utils.js';

/**
 * Analyzes the **business logic** of Angular components, either individually
 * or across an entire Project.
 * 
 * Exposes two entry points:
 *  - `analyze(file, widgets, routeMap): WidgetEventMap[]`
 *      Analyze one component `.ts` file’s widgets.
 *  - `analyzeProject(project, registry, routeMap): WidgetEventMap[]`
 *      Discover and analyze *all* components in a `ts-morph` Project.
 */
export class LogicAnalyzer {
    // ────────────────────────────────────────────────────────────────────────────
    // 1) ANALYSIS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Analyzes **all** components in an Angular workspace.
     *
     * Steps:
     *   1. Finds each `@Component` class in each SourceFile
     *   2. Matches its `selector` to a `ComponentInfo` in the registry
     *   3. Flattens the `WidgetInfo` tree → flat array
     *   4. Delegates to `analyze()` for each component
     *
     * @param project   The ts-morph `Project` representing the workspace
     * @param registry  Precomputed `ComponentRegistry` with template‐derived metadata
     * @param routeMap  Full `RouteMap` for dynamic route resolution
     * @returns         A consolidated `WidgetEventMap[]` for every widget across the project
     */
    analyzeProject(
        project: Project,
        registry: ComponentRegistry,
        routeMap: RouteMap
    ): WidgetEventMap[] {
        const all: WidgetEventMap[] = [];

        for (const sf of project.getSourceFiles()) {
            // 1) find primary @Component class in this file
            const cls = LogicUtils.getPrimaryComponentClass(sf);
            if (!cls)
                continue;

            // 2) extract its selector
            const dec = cls.getDecorator("Component");
            const selector = LogicUtils.getSelectorFromDecorator(dec!);
            if (!selector)
                continue;

            // 3) find matching ComponentInfo
            const ci = registry.components.find(c => c.selector === selector);
            if (!ci)
                continue;

            // 4) flatten widget hierarchy
            const widgets = TemplateUtils.flattenWidgets(ci.widgets);

            // 5) analyze this file + widgets
            all.push(...this.analyze(sf, widgets, routeMap));
        }

        return all;
    }

    /**
     * Analyzes one component’s widgets within a single `SourceFile`.
     *
     * @param file      The ts-morph `SourceFile` for a component `.ts` file
     * @param widgets   Flat array of `WidgetInfo` to analyze
     * @param routeMap  The `RouteMap` for resolving dynamic routes
     * @returns         An array of `WidgetEventMap`, one per widget with events
     */
    analyze(
        file: SourceFile,
        widgets: WidgetInfo[],
        routeMap: RouteMap
    ): WidgetEventMap[] {
        // 0) find the Component class
        const compClass = LogicUtils.getPrimaryComponentClass(file);
        if (!compClass) {
            console.warn('[Logic Analyzer] No @Component class found; skipping file.');
            return [];
        }

        // 1) scan its methods
        const methods = this._extractMethods(compClass);

        // 2) collect all form control validations
        const validationMap = this._extractValidationRules(compClass);
        console.log('[Logic Analyzer] Validation Rules Map →', Array.from(validationMap.entries()));

        // 3) analyze each widget (wire events, extract calls, attach validations)
        return widgets
            .map(w => this._analyzeWidget(w, methods, validationMap, routeMap))
            .filter(wem => wem !== null);
    }

    /**
     * For one widget:
     *  - Builds its list of `EventContext` by matching each declared event
     *    to a method and extracting all calls inside it.
     *  - Attaches validation rules to the widget (by formControlName,
     *    then by matching its id segments).
     *
     * @param widget
     *   The `WidgetInfo` to analyze.
     * @param methods
     *   Map of component methods (name → declaration).
     * @param validationMap
     *   ControlName → validators array.
     * @param routeMap
     *   For resolving router.navigate calls.
     * @returns
     *   A `WidgetEventMap` or `null` if no events were found.
     */
    private _analyzeWidget(
        widget: WidgetInfo,
        methods: Map<string, MethodDeclaration>,
        validationMap: Map<string, string[]>,
        routeMap: RouteMap
    ): WidgetEventMap | null {
        const eventContexts: EventContext[] = [];

        for (const [event, handler] of Object.entries(widget.events)) {
            // Turn every routerLink into a dynamic navigation call
            if (event === 'routerLink' && typeof handler === 'string'){
                eventContexts.push({
                    event,
                    handler: '',
                    calls: [{
                        caller: event,
                        called: handler,
                        data: [] 
                    }] 
                });
                continue;
            }

            // Skip undefined handlers
            if (!handler)
                continue;

            // If the handler method exists, extract its calls
            const handlerBody = methods.get(handler);
            if (handlerBody) {
                const calls = this._collectEventHandlerCalls(handlerBody, routeMap);
                eventContexts.push({ event, handler, calls });
            }
            else
                console.warn(`[Logic Analyzer] Handler ${handler} for event ${event} not found in component.`);
        }

        // attach validation rules
        this._attachValidationRules(widget, validationMap);

        return eventContexts.length > 0
            ? { widgetID: widget.id, events: eventContexts }
            : null;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 2) METHOD EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Gathers every method declared on the primary component class.
     *
     * @param compClass
     *   The `@Component` `ClassDeclaration`.
     * @returns
     *   Map of methodName → MethodDeclaration.
     */
    private _extractMethods(compClass: ClassDeclaration): Map<string, MethodDeclaration> {
        const methods = new Map<string, MethodDeclaration>();

        // Assume one main @Component class per file; collect its methods
        for (const method of compClass.getMethods())
            methods.set(method.getName(), method);

        return methods;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 3) EVENT-HANDLER CALLS EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Walks through a handler’s body, finds each `CallExpression`, and—
     * depending on its caller—resolves either a dynamic route or a backend call.
     *
     * @param handler
     *   The method’s AST node.
     * @param routeMap
     *   For matching `router.navigate([...])`.
     * @returns
     *   Deduped `EventHandlerCallContext[]`.
     */
    private _collectEventHandlerCalls(handler: MethodDeclaration, routeMap: RouteMap): EventHandlerCallContext[] {
        const map = new Map<string, EventHandlerCallContext>(); // Store unique calls

        // Find all CallExpressions within the handler body
        for (const callExpr of handler.getDescendantsOfKind(SyntaxKind.CallExpression)) {
            const caller = callExpr.getExpression().getText();
            let called = "", data: string[] = [];

            if (this._isRouterNavigateCall(caller)) {
                // 1) If it’s a router navigation call, attempt to match full segments
                const navResult = this._resolveRouterNavigate(callExpr, routeMap);
                called = navResult.route;
                data = navResult.params;
            }

            else if (this._isServiceCall(caller))
                // 2) If it's a service call to the backend
                called = '/backend';

            const key = `${caller}->${called}`;
            const existing = map.get(key);

            if (!existing || existing.data.length < data.length)
                map.set(key, { caller, called, data });
        }

        return Array.from(map.values());
    }

    /**
     * Determines if the given caller text corresponds to a .navigate(...) invocation.
     *
     * @param callerText
     *   The expression text of the call (e.g. "this.router.navigate").
     * @returns
     *   `true` if it matches a navigation call, `false` otherwise.
     */
    private _isRouterNavigateCall(callerText: string): boolean {
        return /\.\s*navigate\s*/.test(callerText);
    }

    /**
     * Parses a CallExpression assumed to be `router.navigate([...])` and attempts to resolve
     * a matching dynamic route from the `RouteMap`.
     *
     * We compare the *entire* segment array from the handler’s call
     * (after stripping quotes) against each candidate route’s `route` field.
     *
     * Example:
     *   handler: navigate(['/users', id, 'details', detailId])
     *   → arrayArgs = ["'/users'", id, "'details'", detailId]
     *   → segs = ["users", "<id>", "details", "<detailId>"]
     *
     *   routeMap entry "users/:id/details/:detailId" → routeSegments = ["users", ":id", "details", ":detailId"]
     *
     *   We match index by index: string values for static segments, and `:` prefixes for dynamic segments.
     *
     * @param callExpr
     *   The `CallExpression` node for `router.navigate(...)`.
     * @param routeMap
     *   The `RouteMap` for matching dynamic segments.
     * @returns
     *   An object `{ route: string, params: string[] }`. If no dynamic route is found, `route` remains ''.
     */
    private _resolveRouterNavigate(
        callExpr: CallExpression,
        routeMap: RouteMap
    ): { route: string; params: string[] } {
        let route = '';
        let params: string[] = [];

        // Expect exactly one argument: an ArrayLiteralExpression
        const args = callExpr.getArguments();
        if (args.length === 1 && args[0].isKind(SyntaxKind.ArrayLiteralExpression)) {

            // Build handler navigation segments by stripping quotes on string literals or keeping identifier text
            const handlerSegs = args[0]
                .getElements()
                .map(e => e.getText()
                    .replace(/['"`]/g, '')    // ← strip any quotes
                    .replace(/^\/+/, "")      // ← strip any leading slash
                )
                .filter(seg => seg.length > 0);

            // All remaining elements beyond the first will be parameters or literal strings:
            // Everything after the first segment is a mix of dynamic params (identifiers) or string literals.
            // We’ll pass those raw values back in params[] so we can compare counts later.
            params = handlerSegs.slice(1);

            for (const componentRoute of routeMap.routes) {
                // Split the candidate route into segments
                // e.g. "users/:id/details/:detailId" → ["users", ":id", "details", ":detailId"]
                const routeSegs = componentRoute.route
                    .split('/')
                    .filter(seg => seg.length > 0);

                // If segment counts differ, skip immediately
                if (routeSegs.length !== handlerSegs.length)
                    continue;

                // Check each segment one by one:
                // If the route segment is dynamic (":...")
                // Or static segments match exactly
                if (routeSegs.every((part, index) => part.startsWith(':') || part === handlerSegs[index])) {
                    // Reconstruct "route" with parameter placeholders intact
                    // (i.e. "/users/:id/details/:detailId")
                    route = componentRoute.route;
                    break;
                }
            }
        }
        return { route, params };
    }

    /**
     * Determines if the caller likely references a service (heuristic: name contains "service" or "Service").
     *
     * @param callerText
     *   The expression text of the call (e.g. "this.userService.saveUser").
     * @returns
     *   `true` if it's assumed to be a service call, `false` otherwise.
     */
    private _isServiceCall(callerText: string): boolean {
        return /\bthis\.[A-Za-z]+Service\./i.test(callerText);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 4) FORM VALIDATION RULE EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Finds every `formBuilder.group(...)` call (in properties, constructor, methods)
     * and extracts each control’s validator list from a component's class.
     */
    private _extractValidationRules(compClass: ClassDeclaration): Map<string, string[]> {
        const validationMap = new Map<string, string[]>();

        // class-level, constructor, methods…
        this._scanForGroupCalls(compClass, (call) =>
            this._processGroupCall(call, validationMap)
        );

        return validationMap;
    }

    /**
     * Collects every `formBuilder.group(...)` call found:
     *  - class-property initializers
     *  - constructor assignments
     *  - any method bodies
     *
     * @param compClass
     *   The component’s `ClassDeclaration`.
     * @param cb
     *   Callback invoked for each `group(...)` call found.
     */
    private _scanForGroupCalls(
        compClass: ClassDeclaration,
        cb: (callExpr: CallExpression) => void
    ) {
        // a) class properties
        for (const p of compClass.getProperties()) {
            const init = p.getInitializer();
            if (
                init && init.isKind(SyntaxKind.CallExpression) &&
                /\.group\s*\(/.test(init.getExpression().getText())
            )
                cb(init);
        }

        // b) constructor body
        const ctor = compClass.getConstructors()[0] as ConstructorDeclaration | undefined;
        if (ctor) {
            for (const stmt of ctor.getStatements()) {
                const call = stmt
                    .getDescendantsOfKind(SyntaxKind.CallExpression)
                    .find((c) => c.getExpression().getText().includes('formBuilder.group'));
                if (call)
                    cb(call);
            }
        }

        // c) methods
        for (const m of compClass.getMethods()) {
            const call = m
                .getDescendantsOfKind(SyntaxKind.CallExpression)
                .find((c) => c.getExpression().getText().includes('formBuilder.group'));
            if (call)
                cb(call);
        }
    }

    /**
     * Extracts control-name → validators list from one `formBuilder.group(...)` call.
     *
     * @param callExpr
     *   The `CallExpression` node for `.group({ ... })`.
     * @param validationMap
     *   Map to populate: controlName → validator strings.
     */
    private _processGroupCall(
        callExpr: CallExpression,
        validationMap: Map<string, string[]>
    ): void {
        // The first argument to formBuilder.group(…) should be an object literal
        const controlsObj = callExpr.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!controlsObj)
            return;

        this._processControlProperties(controlsObj, validationMap);
    }

    /**
     * Processes each property in the object literal passed to `formBuilder.group({...})`,
     * extracting control names and their associated validation rules.
     *
     * @param controlsObj
     *   The `ObjectLiteralExpression` containing control definitions.
     * @param validationMap
     *   The map to populate: `controlName -> array of validator expressions`.
     */
    private _processControlProperties(
        controlsObj: ObjectLiteralExpression,
        validationMap: Map<string, string[]>
    ): void {
        for (const prop of controlsObj.getProperties()) {
            if (!prop.isKind(SyntaxKind.PropertyAssignment))
                continue;

            const name = prop.getName().replace(/['"]/g, '');
            const initializer = prop.getInitializer();
            if (initializer && initializer.isKind(SyntaxKind.ArrayLiteralExpression)) {
                const elements = initializer.getElements();
                const validatorsNode = elements.length > 1 ? elements[1] : undefined;
                let rules: string[] = [];

                // Case A: An array literal of validators, e.g. [Validators.required, Validators.min(0)]
                if (validatorsNode && validatorsNode.isKind(SyntaxKind.ArrayLiteralExpression))
                    rules = this._collectValidatorsFromArray(validatorsNode);

                // Case B: A single validator expression, e.g. Validators.required
                else if (validatorsNode && validatorsNode.getText().includes('Validators'))
                    rules.push(validatorsNode.getText());

                validationMap.set(name, rules);
            }
        }
    }

    /**
     * Given an `ArrayLiteralExpression` of validator expressions, returns a string array
     * of any element whose text includes "Validators".
     *
     * @param arrayLit
     *   The `ArrayLiteralExpression` containing validators.
     * @returns
     *   An array of strings (e.g. ["Validators.required", "Validators.min(0)"]).
     */
    private _collectValidatorsFromArray(arrayLit: ArrayLiteralExpression): string[] {
        const rules: string[] = [];
        for (const element of arrayLit.getElements()) {
            const text = element.getText();
            if (text.includes('Validators'))
                rules.push(text);
        }
        return rules;
    }

    /**
     * First attempts to map by `widget.attributes.formControlName`,
     * then as a fallback matches any `__`-delimited segment of `widget.id`
     * against known control names in the `validationMap`.
     *
     * @param widget
     *   The `WidgetInfo` to attach rules to.
     * @param validationMap
     *   Map of controlName → validators array.
     */
    private _attachValidationRules(
        widget: WidgetInfo,
        validationMap: Map<string, string[]>
    ) {
        const name = widget.attributes?.formControlName;
        if (name && validationMap.has(name)) {
            widget.validationRules = validationMap.get(name);
            return;
        }

        const parts = widget.id.toLowerCase().split("__");
        for (const [key, rules] of validationMap.entries()) {
            const lk = key.toLowerCase();
            if (widget.id.toLowerCase().includes(lk) || parts.includes(lk)) {
                widget.validationRules = rules;
                break;
            }
        }
    }
}