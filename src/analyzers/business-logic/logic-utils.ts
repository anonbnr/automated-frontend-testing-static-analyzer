// ──────────────────────────────────────────────────────────────────────────────
// analyzers/business-logic/logic-utils.ts
//
// Static helpers for **business-logic** analysis of Angular components.
//
// Responsibilities:
//   1. EventContext construction        (buildEventContext, navEventContext,
//                                       parseFunctionCall, fragmentNavigationContext)
//   2. Method extraction                (extractMethods)
//   3. Handler call extraction          (collectEventHandlerCalls,
//                                       isRouterNavigateCall,
//                                       resolveRouterNavigate,
//                                       isServiceCall)
//   4. Form validation extraction       (extractValidationRules,
//                                       scanForGroupCalls,
//                                       processGroupCall,
//                                       processControlProperties,
//                                       collectValidatorsFromArray,
//                                       attachValidationRules)
// ──────────────────────────────────────────────────────────────────────────────

import { ArrayLiteralExpression, CallExpression, ClassDeclaration, ConstructorDeclaration, ElementAccessExpression, MethodDeclaration, ObjectLiteralExpression, PropertyAccessExpression, SyntaxKind } from "ts-morph";
import logger from "../../logging/logger.js";
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from "../../models/analyzer-config.js";
import { EventContext, EventHandlerCallContext, NavEventType, UserEventType } from "../../models/event-info.js";
import { RouteMap } from "../../models/route-info.js";
import { WidgetInfo } from "../../models/widget-info.js";

/**
 * Static utility methods for extracting UI-to-logic metadata
 * from Angular component classes.
 *
 * Contains helpers to:
 *   - build an `EventContext` from widget events and handlers
 *   - collect all class methods
 *   - walk handler bodies and resolve router navigations & service calls
 *   - extract FormBuilder validation rules
 */
export class LogicUtils {
    // ────────────────────────────────────────────────────────────────────────────
    // 1) EVENT CONTEXT CONSTRUCTION
    // ────────────────────────────────────────────────────────────────────────────
    /**
     * Builds an `EventContext` for a given event–handler binding.
     *
     * @param event        The type of event (e.g. `'click'`, `'submit'`, `'routerLink'`, `'href'`, `'static-redirect'`).
     * @param handlerExpr  The raw handler expression string from the template (e.g. `"onSave()"`, `"/home"`, etc.).
     * @param methods      Map of component method names → their `MethodDeclaration` AST nodes.
     * @param routeMap     The `RouteMap` used to resolve fragment or dynamic-route navigations.
     * @returns            An `EventContext` if the handler can be resolved; otherwise `undefined`.
     */
    static buildEventContext(
        event: UserEventType | NavEventType,
        handlerExpr: string,
        methods: Map<string, MethodDeclaration>,
        routeMap: RouteMap,
        cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG
    ): EventContext | undefined {
        // 0) normalize event:
        const normalizedEvent = (event === 'ngSubmit' ? 'submit' : event);

        logger.log(
            'trace',
            '[LogicUtils] buildEventContext(event=%s, normalized=%s, handler="%s")',
            event,
            normalizedEvent,
            handlerExpr
        );

        // 1) literal href / routerLink / static-redirect
        if (normalizedEvent === 'href' || normalizedEvent === 'routerLink' || normalizedEvent === 'static-redirect') {
            logger.debug(
                '[LogicUtils] [%s] treating "%s" as literal navigation',
                normalizedEvent,
                handlerExpr
            );
            return this.navEventContext(normalizedEvent, handlerExpr);
        }

        // 2) explicit fnName('someFragment') patterns
        const fnCall = this.parseFunctionCall(handlerExpr);
        if (fnCall) {
            logger.log('trace', '[LogicUtils] parseFunctionCall → %o', fnCall);
            const navCtx = this.fragmentNavigationContext(normalizedEvent, fnCall.name, fnCall.arg, routeMap, cfg);
            if (navCtx) {
                logger.debug(
                    '[LogicUtils] fragmentNavigationContext → %o',
                    navCtx.callContexts
                );
                return navCtx;
            }
        }

        // 3) otherwise, assume handlerExpr is a real method name
        const methodName = handlerExpr.replace(/\(.*\)$/, '').trim();
        const methodDecl = methods.get(methodName);
        if (methodDecl) {
            logger.debug(
                '[LogicUtils] Found method "%s", extracting calls…',
                methodName
            );
            const calls = this.collectEventHandlerCalls(methodDecl, cfg);
            logger.log(
                'trace',
                '[LogicUtils] collectEventHandlerCalls → %o',
                calls
            );
            return { event: normalizedEvent, handler: methodName, callContexts: calls };
        }

        logger.warn(
            '[LogicUtils] No handler found for "%s" on event "%s"',
            handlerExpr,
            normalizedEvent
        );

        return undefined;
    }

    /**
     * Parses a handler expression of the form `fn(arg)` or `fn('literal')` into its name + argument.
     *
     * @param expr   The raw handler expression (e.g. `"navigate('/dashboard')"`, `"showModal(id)"`).
     * @returns      An object `{ name, arg }` if it matches, or `undefined` otherwise.
     */
    static parseFunctionCall(expr: string): { name: string; arg: string } | undefined {
        // Handles both fn('foo') and fn(bar) 
        logger.log('trace', '[LogicUtils] parseFunctionCall("%s")', expr);
        const m = expr.match(/^([A-Za-z_$][\w$]*)\(\s*(?:['"]?([^'")]+)['"]?)\s*\)$/);
        return m ? { name: m[1], arg: m[2] } : undefined;
    }

    /**
     * Constructs an `EventContext` for a pure navigation binding
     * (`routerLink`, `href`, or a static-redirect).
     *
     * @param event   The navigation event type.
     * @param target  The target route or URL string.
     * @returns       An `EventContext` with a single callContext for that navigation.
     */
    static navEventContext(
        event: NavEventType,
        target: string
    ): EventContext {
        logger.log(
            'trace',
            '[LogicUtils] navEventContext(event=%s, target="%s")',
            event,
            target
        );
        return {
            event,
            handler: '',
            callContexts: [{
                caller: event,
                called: target,
                data: []
            }]
        };
    }

    /**
     * If the call `fnName(fragment)` corresponds to a route ending in `/${fragment}`,
     * returns an `EventContext` for that navigation.
     *
     * @param event     The originating UI event (e.g. `'click'`).
     * @param fnName    The function name being called (e.g. `'goToSection'`).
     * @param fragment  The fragment argument (e.g. `'details'`).
     * @param routeMap  The `RouteMap` in which to look up matching routes.
     * @returns         An `EventContext` if a matching route is found; otherwise `undefined`.
     */
    static fragmentNavigationContext(
        event: UserEventType,
        fnName: string,
        fragment: string,
        routeMap: RouteMap,
        _cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG
    ): EventContext | undefined {
        logger.log(
            'trace',
            '[LogicUtils] fragmentNavigationContext(event=%s, fn="%s", fragment="%s")',
            event,
            fnName,
            fragment
        );
        // find any route that endsWith `/fragment`
        const route = routeMap.routes.find(r => r.route.endsWith(`/${fragment}`))?.route;
        if (!route) {
            logger.log('trace', '[LogicUtils] No matching route for fragment="%s"', fragment);
            return undefined;
        }

        logger.debug(
            '[LogicUtils] fragment → resolved to route "%s"',
            route
        );

        return {
            event,
            handler: '', // inlined
            callContexts: [{
                caller: fnName,
                called: route,
                data: []
            }]
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 2) METHOD EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Gathers every **instance** method declared on the primary component class.
     *
     * @param compClass
     *   The `ClassDeclaration` node for an Angular component.
     * @returns
     *   A Map where each key is a method name and each value is its `MethodDeclaration` AST node.
     */
    static extractMethods(compClass: ClassDeclaration): Map<string, MethodDeclaration> {
        logger.log('trace', '[LogicUtils] extractMethods()');
        const methods = new Map<string, MethodDeclaration>();

        // Assume one main @Component class per file; collect its methods
        for (const method of compClass.getMethods())
            methods.set(method.getName(), method);

        logger.debug(
            '[LogicUtils] extractMethods → gathered %d methods',
            methods.size
        );

        return methods;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 3) EVENT-HANDLER CALLS EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Walks through a handler’s body, locates every `CallExpression`, and—
     * depending on the call—resolves it as:
     *   1. a router navigation (caller=`this.router`, called=`navigate`, data=`[...segments]`)
     *   2. a backend service call (caller=`this.userService`, called=`saveUser`, data=`['/backend']`)
     *   3. anything else (caller=object or fn name, called=methodName, data=`[]`)
     *
     * @param handler
     *   The `MethodDeclaration` AST node for the component’s handler.
     * @param routeMap
     *   The `RouteMap` for matching and resolving `router.navigate([...])`.
     * @returns
     *   A deduped array of `EventHandlerCallContext`, each matching:
     *     { caller: string; called: string; data: string[] }
     */
    static collectEventHandlerCalls(
        handler: MethodDeclaration,
        cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG
    ): EventHandlerCallContext[] {
        logger.log(
            'trace',
            '[LogicUtils] collectEventHandlerCalls(%s)',
            handler.getName()
        );

        // create a map to store unique event handler call contexts
        const uniqueCalls = new Map<string, EventHandlerCallContext>();
        const calls = handler.getDescendantsOfKind(SyntaxKind.CallExpression);

        logger.debug('[LogicUtils] Found %d call expressions', calls.length);

        // Find all CallExpressions within the handler body
        for (const callExpr of calls) {
            // 1) Break apart `expr` → { caller, methodName }
            const expr = callExpr.getExpression();
            let caller: string;
            let methodName: string;

            if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
                const pae = expr as PropertyAccessExpression;
                caller = pae.getExpression().getText(); // e.g. "this.router" or "this.userService"
                methodName = pae.getName(); // e.g. "navigate" or "saveUser"
            }
            else if (expr.isKind(SyntaxKind.ElementAccessExpression)) {
                const eae = expr as ElementAccessExpression;
                caller = eae.getExpression().getText();
                const arg = eae.getArgumentExpression()?.getText() ?? '';
                methodName = arg.replace(/['"`]/g, '');     // e.g. "_destroyOverlay"
                if (methodName.startsWith('_')) continue;   // private → drop
            }

            else {
                // fallback: identifier or something else
                caller = expr.getText(); // e.g. "someGlobalFn"
                methodName = expr.getText();
            }

            let called = methodName;
            let data: string[] = [];
            let isBackend = false;

            // 2) Special-case router navigation
            const isNav = this.isRouterNavigateCall(expr.getText());
            if (isNav) {
                const { segments } = this.resolveRouterNavigate(callExpr);
                data = segments;
            }

            // 3) Service/Http calls → mark as backend
            else if (this.isBackendServiceCaller(caller, cfg)) {
                isBackend = true;
                // canonical backend sentinel + helpful labels
                const raw = caller.replace(/^this\./, '').split('.')[0]; // e.g. "userService"
                const service = cfg.backend.normalizeServiceName(raw);
                data = ['/backend', service, methodName];

                logger.debug('[LogicUtils] backend call detected → %s.%s', caller, methodName);
            }

            // 4) Filter noisy non-domain related calls
            if (this.isNoiseCall(caller, methodName, isBackend, isNav, cfg)) continue; // drop Rx/logging/etc.

            // 5) Build the unique key & dedupe
            const key = `${caller}.${methodName}|${data.join(",")}`;
            if (!uniqueCalls.has(key)) {
                uniqueCalls.set(key, { caller, called, data });
                logger.log(
                    'trace',
                    '[LogicUtils] Added callContext %o',
                    { caller, called: methodName, data }
                );
            }
        }

        const result = Array.from(uniqueCalls.values());
        logger.debug(
            '[LogicUtils] collectEventHandlerCalls → deduped to %d contexts',
            result.length
        );
        return result;
    }

    /**
     * Determines whether the given text corresponds to a `<identifier>.navigate(...)` call.
     *
     * @param callerText  The expression text of the call (e.g. `"this.router.navigate"`).
     * @returns           `true` if it looks like a navigation call; otherwise `false`.
     */
    static isRouterNavigateCall(callerText: string): boolean {
        logger.log(
            'trace',
            '[LogicUtils] isRouterNavigateCall("%s")',
            callerText
        );
        return /\.\s*navigate(?:ByUrl)?\s*(?:\(|$)/.test(callerText);
    }

    /**
     * Given a CallExpression for `<identifier>.navigate([...])`, returns
     * the _stripped_ segments passed to it.
     *
     * @param callExpr
     *   The CallExpression for `<identifier>.navigate( arrayLiteral )`.
     * @returns
     *   `{ segments: string[] }` where each element is the raw segment
     *   (no quotes, no leading “/”).
     */
    static resolveRouterNavigate(callExpr: CallExpression): { segments: string[] } {
        logger.log('trace', '[LogicUtils] resolveRouterNavigate()');
        const args = callExpr.getArguments();

        if (!args.length) return { segments: [] };

        const first = args[0];

        // Case A: navigateByUrl(createUrlTree([...]))
        if (first.isKind(SyntaxKind.CallExpression) &&
            /createUrlTree/.test(first.getExpression().getText())) {
            const arg0 = first.getArguments()[0];
            if (arg0?.isKind(SyntaxKind.ArrayLiteralExpression)) {
                const segs = arg0.getElements()
                    .map(e => e.getText().replace(/['"`]/g, "").replace(/^\/+/, ""))
                    .filter(Boolean);
                logger.debug('[LogicUtils] resolveRouterNavigate (UrlTree) → %o', segs);
                return { segments: segs };

            }
        }

        // Case B: navigate([...])
        if (first.isKind(SyntaxKind.ArrayLiteralExpression)) {
            const arrayLit = first as ArrayLiteralExpression;
            const segments = arrayLit
                .getElements()
                .map(e => e.getText().replace(/['"`]/g, "").replace(/^\/+/, ""))
                .filter(s => s.length > 0);
            logger.debug('[LogicUtils] resolveRouterNavigate (array) → %o', segments);
            return { segments };
        }

        // Case C: navigateByUrl('/a/b') OR navigate('/a/b') as string
        const asText = first.getText().replace(/[`'"]/g, "").replace(/^\/+/, "");
        const segments = asText.split('/').filter(Boolean);
        logger.debug('[LogicUtils] resolveRouterNavigate (string) → %o', segments);
        return { segments };
    }

    /**
     * Heuristic to decide whether a call is to a backend service
     * (e.g. `this.userService.save()`).
     *
     * @param callerText  The expression text of the call (e.g. `"this.userService.saveUser"`).
     * @returns           `true` if it appears to call a `*Service` method; otherwise `false`.
     */
    static isBackendServiceCaller(callerText: string, cfg: AnalyzerConfig): boolean {
        // Must be a root like "this.userService" or "this.http" – not a CallExpression result
        if (/\(/.test(callerText)) return false; // exclude call-results: "...addPost(...)"
        return cfg.backend.serviceCallerRe.test(callerText);
    }

    static isNoiseCall(caller: string, methodName: string, isBackend: boolean, isNav: boolean, cfg: AnalyzerConfig): boolean {
        // 1) Noise method-names take precedence
        if (cfg.noise.methodNames.has(methodName)) return true;

        // 2) Otherwise keep nav/backend
        if (isBackend || isNav) return false;

        // 3) Logging
        if (/^console$/.test(caller) && methodName === 'log') return true;

        // 4) Noisy functions
        if (!caller.includes('.') && cfg.noise.freeFunctions.has(methodName)) return true;
        return false;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 4) FORM VALIDATION RULE EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Scans a component class for every `formBuilder.group(...)` invocation
     * and populates a map of controlName → validator list.
     *
     * @param compClass  The `ClassDeclaration` of the component.
     * @returns          A `Map` where each key is a form control name and the value is an array of validator expressions.
     */
    static extractValidationRules(compClass: ClassDeclaration): Map<string, string[]> {
        logger.log('trace', '[LogicUtils] extractValidationRules()');
        const validationMap = new Map<string, string[]>();
        logger.debug('[LogicUtils] extractValidationRules – scanning for formBuilder.group calls');

        // class-level, constructor, methods…
        this.scanForGroupCalls(compClass, (call) => {
            logger.log('trace', '[LogicUtils] Found formBuilder.group call → processing…');
            this.processGroupCall(call, validationMap);
        });

        logger.debug(
            '[LogicUtils] extractValidationRules → %o',
            Array.from(validationMap.entries())
        );

        return validationMap;
    }

    /**
     * Finds all calls to `formBuilder.group(...)` within:
     *  - class-property initializers,
     *  - the constructor body,
     *  - any method bodies.
     *
     * @param compClass  The component’s `ClassDeclaration`.
     * @param cb         Callback invoked for each `CallExpression` found.
     */
    static scanForGroupCalls(
        compClass: ClassDeclaration,
        cb: (callExpr: CallExpression) => void
    ) {
        logger.log('trace', '[LogicUtils] scanForGroupCalls()');
        // a) class properties
        for (const p of compClass.getProperties()) {
            const init = p.getInitializer();
            if (
                init && init.isKind(SyntaxKind.CallExpression) &&
                /\.group\s*\(/.test(init.getExpression().getText())
            ) {
                logger.log('trace', '[LogicUtils] scanForGroupCalls – property initializer');
                cb(init);
            }
        }

        // b) constructor body
        const ctor = compClass.getConstructors()[0] as ConstructorDeclaration | undefined;
        if (ctor) {
            for (const stmt of ctor.getStatements()) {
                const call = stmt
                    .getDescendantsOfKind(SyntaxKind.CallExpression)
                    .find((c) => c.getExpression().getText().includes('formBuilder.group'));
                if (call) {
                    logger.log(
                        'trace',
                        '[LogicUtils] scanForGroupCalls – constructor body'
                    );
                    cb(call);
                }
            }
        }

        // c) methods
        for (const m of compClass.getMethods()) {
            const call = m
                .getDescendantsOfKind(SyntaxKind.CallExpression)
                .find((c) => c.getExpression().getText().includes('formBuilder.group'));
            if (call) {
                logger.log('trace', '[LogicUtils] scanForGroupCalls – method %s', m.getName());
                cb(call);
            }
        }
    }

    /**
     * Processes a single `formBuilder.group({...})` call, extracting the
     * controls object and delegating to `processControlProperties`.
     *
     * @param callExpr       The `CallExpression` for `.group({ ... })`.
     * @param validationMap  Map to populate: controlName → validators[].
     * @modifies validationMap
     */
    static processGroupCall(
        callExpr: CallExpression,
        validationMap: Map<string, string[]>
    ): void {
        logger.log('trace', '[LogicUtils] processGroupCall()');
        // The first argument to formBuilder.group(…) should be an object literal
        const controlsObj = callExpr.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!controlsObj) {
            logger.warn('[LogicUtils] processGroupCall – no object literal found');
            return;
        }

        this.processControlProperties(controlsObj, validationMap);
    }

    /**
     * Extracts validator lists from a formBuilder.group({...}) call.
     *
     * @param controlsObj    The `{ … }` passed to `group()`.
     * @param validationMap  Populated: controlName → validators[].
     * @modifies validationMap
     */
    static processControlProperties(
        controlsObj: ObjectLiteralExpression,
        validationMap: Map<string, string[]>
    ): void {
        logger.log(
            'trace',
            '[LogicUtils] processControlProperties() – %d props',
            controlsObj.getProperties().length
        );
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
                    rules = this.collectValidatorsFromArray(validatorsNode);

                // Case B: A single validator expression, e.g. Validators.required
                else if (validatorsNode && validatorsNode.getText().includes('Validators'))
                    rules.push(validatorsNode.getText());

                validationMap.set(name, rules);
                logger.debug(
                    '[LogicUtils] control="%s" → rules=%o',
                    name,
                    rules
                );
            }
        }
    }

    /**
     * Given an `ArrayLiteralExpression` of validator expressions,
     * returns the subset whose `.getText()` includes `"Validators"`.
     *
     * @param arrayLit  The `ArrayLiteralExpression` node containing validator entries.
     * @returns         An array of validator snippets (e.g. `["Validators.required", "Validators.min(0)"]`).
     */
    static collectValidatorsFromArray(arrayLit: ArrayLiteralExpression): string[] {
        logger.log('trace', '[LogicUtils] collectValidatorsFromArray()');
        const rules: string[] = [];
        for (const element of arrayLit.getElements()) {
            const text = element.getText();
            if (text.includes('Validators')) {
                logger.log('trace', '[LogicUtils] validator → %s', text);
                rules.push(text);
            }
        }
        return rules;
    }

    /**
     * Attaches form‐control validation rules onto a widget.
     *
     * First tries `widget.attributes.formControlName`, then
     * falls back to matching segments of the `widget.id`.
     *
     * @param widget          The WidgetInfo to decorate.
     * @param validationMap   ControlName → validators[] map.
     * @modifies widget.validationRules
     */
    static attachValidationRules(
        widget: WidgetInfo,
        validationMap: Map<string, string[]>
    ) {
        logger.log(
            'trace',
            '[LogicUtils] attachValidationRules(widget=%s)',
            widget.id
        );
        const ctrl = widget.attributes?.formControlName;
        if (ctrl && validationMap.has(ctrl)) {
            widget.validationRules = validationMap.get(ctrl);
            logger.debug(
                '[LogicUtils] attached rules %o to widget %s via formControlName',
                widget.validationRules,
                widget.id
            );
            return;
        }

        const parts = widget.id.toLowerCase().split("__");
        for (const [key, rules] of validationMap.entries()) {
            const lk = key.toLowerCase();
            if (widget.id.toLowerCase().includes(lk) || parts.includes(lk)) {
                widget.validationRules = rules;
                logger.debug(
                    '[LogicUtils] attached rules %o to widget %s by ID match',
                    rules,
                    widget.id
                );
                break;
            }
        }
    }
}