// ──────────────────────────────────────────────────────────────────────────────
// analyzers/business-logic/logic-utils.ts
//
// Static helpers for **business-logic** analysis of Angular components.
//
// Responsibilities:
//   1) EventContext construction
//      - buildEventContext: turn a widget event + handler string into EventContext
//      - navEventContext:   create a pure navigation EventContext
//      - parseFunctionCall: parse "fn(arg)" into {name, arg}
//      - fragmentNavigationContext: map fn('fragment') to a known route tail
//
//   2) Method extraction
//      - extractMethods: collect instance MethodDeclaration nodes by name
//
//   3) Handler call extraction
//      - collectEventHandlerCalls: list significant calls inside a handler body
//      - isRouterNavigateCall / resolveRouterNavigate: recognize Router.navigate*
//      - isBackendServiceCaller: detect "*Service"/http/api callers
//      - isNoiseCall: filter out Rx/logging/plumbing calls
//
//   4) Form validation extraction
//      - extractValidationRules: gather validators from formBuilder.group(...)
//      - scanForGroupCalls / processGroupCall / processControlProperties
//      - collectValidatorsFromArray / attachValidationRules
//
// Notes
//   • These utilities operate on TypeScript ASTs (ts-morph) and template-derived
//     widget metadata; they never execute code.
//   • Logging is intentionally verbose (trace/debug) to aid troubleshooting.
//   • The AnalyzerConfig tunes backend detection and noise filtering.
// ──────────────────────────────────────────────────────────────────────────────

import { ArrayLiteralExpression, CallExpression, ClassDeclaration, ConstructorDeclaration, ElementAccessExpression, MethodDeclaration, ObjectLiteralExpression, PropertyAccessExpression, SyntaxKind } from "ts-morph";
import logger from "../../logging/logger.js";
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from "../../models/analyzer-config.js";
import { EventContext, EventHandlerCallContext, NavEventType, UserEventType } from "../../models/event-info.js";
import { RouteMap } from "../../models/route-info.js";
import { WidgetInfo } from "../../models/widget-info.js";

/**
 * Static utility methods for extracting UI→logic metadata
 * from Angular component classes (no side effects).
 */
export class LogicUtils {
    // ────────────────────────────────────────────────────────────────────────────
    // 1) EVENT CONTEXT CONSTRUCTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Build an EventContext for a given event–handler binding.
    *
    * Resolution order:
    *   1. If event is routerLink/href/static-redirect → literal nav EventContext
    *   2. If handler looks like fn('fragment') → try fragmentNavigationContext
    *   3. Else treat handler as a method name → collectEventHandlerCalls
    *
    * @param event       Normalized widget/nav event name.
    * @param handlerExpr Raw handler expression from template (e.g., "onSave()", "/home").
    * @param methods     Map of component method names → MethodDeclaration.
    * @param routeMap    RouteMap for resolving fragment → route endings.
    * @param cfg         Analyzer configuration (backend/noise heuristics).
    * @returns           EventContext or undefined if nothing resolvable.
    */
    static buildEventContext(
        event: UserEventType | NavEventType,
        handlerExpr: string,
        methods: Map<string, MethodDeclaration>,
        routeMap: RouteMap,
        cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG
    ): EventContext | undefined {
        // Angular sometimes emits (ngSubmit); normalize to "submit"
        const normalizedEvent = (event === 'ngSubmit' ? 'submit' : event);

        logger.log(
            'trace',
            '[LogicUtils] buildEventContext(event=%s, normalized=%s, handler="%s")',
            event,
            normalizedEvent,
            handlerExpr
        );

        // Case 1: pure navigation bindings (no method body to inspect)
        if (normalizedEvent === 'href' || normalizedEvent === 'routerLink' || normalizedEvent === 'static-redirect') {
            logger.debug(
                '[LogicUtils] [%s] treating "%s" as literal navigation',
                normalizedEvent,
                handlerExpr
            );
            return this.navEventContext(normalizedEvent, handlerExpr);
        }

        // Case 2: Try parsing "fn(arg)" and mapping known fragments to routes
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

        // Case 3: Interpret as a method name, strip trailing parentheses if present
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
    * Parse "fn(arg)" or "fn('literal')" into { name, arg }.
    *
    * @param expr Raw expression string from template.
    * @returns    Parsed pieces or undefined if not a simple call form.
    */
    static parseFunctionCall(expr: string): { name: string; arg: string } | undefined {
        logger.log('trace', '[LogicUtils] parseFunctionCall("%s")', expr);
        // Accepts alnum/underscore/dollar identifiers; argument may be quoted or bare
        const m = expr.match(/^([A-Za-z_$][\w$]*)\(\s*(?:['"]?([^'")]+)['"]?)\s*\)$/);
        return m ? { name: m[1], arg: m[2] } : undefined;
    }

    /**
    * Create a pure navigation EventContext (routerLink/href/static-redirect).
    *
    * @param event  Navigation event type.
    * @param target Destination URL/route literal.
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
    * If "fnName(fragment)" corresponds to a route ending with "/fragment",
    * build a navigation-like EventContext anchored on that route.
    *
    * @param event     Original UI event.
    * @param fnName    Name of the invoked function.
    * @param fragment  Route tail to resolve.
    * @param routeMap  Source of known routes.
    * @returns         EventContext when a route ending matches; else undefined.
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

        // Heuristic: choose the first route that ends with "/<fragment>"
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
            handler: '', // inline navigation (no dedicated method)
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
    * Collect all instance methods declared directly on the component class.
    *
    * @param compClass Component ClassDeclaration.
    * @returns         Map: methodName → MethodDeclaration.
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
    * Walk a handler body and extract significant CallExpressions as
    * EventHandlerCallContext items.
    *
    * Classification:
    *   • Router calls → resolve segments
    *   • Backend calls (Service/http/api) → tag with '/backend' payload
    *   • Others → retain as caller.method with empty data[]
    *
    * Dedupe key = "<caller>.<method>|<data-joined>".
    *
    * @param handler MethodDeclaration to analyze.
    * @param cfg     Analyzer configuration (backend/noise rules).
    * @returns       Deduped list of call contexts (order not guaranteed).
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
                caller = pae.getExpression().getText(); // e.g. "this.router"
                methodName = pae.getName(); // e.g. "navigate"
            }
            else if (expr.isKind(SyntaxKind.ElementAccessExpression)) {
                const eae = expr as ElementAccessExpression;
                caller = eae.getExpression().getText();
                const arg = eae.getArgumentExpression()?.getText() ?? '';
                methodName = arg.replace(/['"`]/g, '');     // bracket access → method name string
                if (methodName.startsWith('_')) continue;   // private-like → ignore
            }

            else {
                // Fallback: simple identifier call
                caller = expr.getText(); // e.g. "someGlobalFn"
                methodName = expr.getText();
            }

            let called = methodName;
            let data: string[] = [];
            let isBackend = false;

            // 2) Router navigation
            const isNav = this.isRouterNavigateCall(expr.getText());
            if (isNav) {
                const { segments } = this.resolveRouterNavigate(callExpr);
                data = segments;
            }

            // 3) Backend/service/http/api
            else if (this.isBackendServiceCaller(caller, cfg)) {
                isBackend = true;
                // canonical backend sentinel + helpful labels
                const raw = caller.replace(/^this\./, '').split('.')[0]; // root service token (e.g. "userService")
                const service = cfg.backend.normalizeServiceName(raw);
                data = ['/backend', service, methodName];

                logger.debug('[LogicUtils] backend call detected → %s.%s', caller, methodName);
            }

            // 4) Filter noise (Rx/logging/etc.) unless navigation/backend
            if (this.isNoiseCall(caller, methodName, isBackend, isNav, cfg)) continue;

            // 5) Dedupe by composite key
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
    * Detect "<something>.navigate(...)" or ".navigateByUrl(...)" patterns.
    *
    * @param callerText Expression text for the call target.
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
    * Extract path segments from navigate[..] / navigateByUrl('...') calls.
    *
    * Supports:
    *   • navigate([ 'a', 'b', id ])          → ['a','b',id]
    *   • navigateByUrl('/a/b')               → ['a','b']
    *   • navigate(createUrlTree([ ... ]))    → [... segments ...]
    *
    * @param callExpr The CallExpression for the router call.
    */
    static resolveRouterNavigate(callExpr: CallExpression): { segments: string[] } {
        logger.log('trace', '[LogicUtils] resolveRouterNavigate()');
        const args = callExpr.getArguments();

        if (!args.length) return { segments: [] };

        const first = args[0];

        // Case A: navigateByUrl(createUrlTree([ ... ]))
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

        // Case B: navigate([ 'a', 'b' ])
        if (first.isKind(SyntaxKind.ArrayLiteralExpression)) {
            const arrayLit = first as ArrayLiteralExpression;
            const segments = arrayLit
                .getElements()
                .map(e => e.getText().replace(/['"`]/g, "").replace(/^\/+/, ""))
                .filter(s => s.length > 0);
            logger.debug('[LogicUtils] resolveRouterNavigate (array) → %o', segments);
            return { segments };
        }

        // Case C: navigateByUrl('/a/b') or navigate('/a/b')
        const asText = first.getText().replace(/[`'"]/g, "").replace(/^\/+/, "");
        const segments = asText.split('/').filter(Boolean);
        logger.debug('[LogicUtils] resolveRouterNavigate (string) → %o', segments);
        return { segments };
    }

    /**
    * Heuristic to detect backend/service callers (e.g., this.userService / this.http).
    *
    * @param callerText Full caller expression text.
    * @param cfg        Analyzer config with regex rules.
    */
    static isBackendServiceCaller(callerText: string, cfg: AnalyzerConfig): boolean {
        // Exclude call results like "factory().service"
        if (/\(/.test(callerText)) return false;
        return cfg.backend.serviceCallerRe.test(callerText);
    }

    /**
    * Decide if a call should be filtered from the event context as "noise".
    *
    * Noise includes:
    *   • Known plumbing method names (cfg.noise.methodNames)
    *   • Free RxJS creators (cfg.noise.freeFunctions) when unqualified
    *   • console.log
    * Navigation/backend calls are preserved even if names appear in noise sets.
    */
    static isNoiseCall(caller: string, methodName: string, isBackend: boolean, isNav: boolean, cfg: AnalyzerConfig): boolean {
        // 1) Hard noise list of method names (e.g., pipe/subscribe/then/...)
        if (cfg.noise.methodNames.has(methodName)) return true;

        // 2) Always keep navigation/backend calls
        if (isBackend || isNav) return false;

        // 3) Console logging
        if (/^console$/.test(caller) && methodName === 'log') return true;

        // 4) Free functions (e.g., of/from/timer) when unqualified
        if (!caller.includes('.') && cfg.noise.freeFunctions.has(methodName)) return true;
        return false;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 4) FORM VALIDATION RULE EXTRACTION
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Extract validators from all occurrences of formBuilder.group({...}).
    *
    * Search scope:
    *   • class property initializers
    *   • constructor body
    *   • all method bodies
    *
    * @param compClass Component class to scan.
    * @returns         Map: controlName → validators[] (raw expression text).
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
    * Find all formBuilder.group(...) calls within:
    *   • class property initializers
    *   • constructor
    *   • methods
    *
    * @param compClass Component class declaration.
    * @param cb        Callback for each CallExpression found.
    */
    static scanForGroupCalls(
        compClass: ClassDeclaration,
        cb: (callExpr: CallExpression) => void
    ) {
        logger.log('trace', '[LogicUtils] scanForGroupCalls()');

        // a) Property initializers (e.g., profileForm = formBuilder.group({...}))
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

        // b) Constructor body
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

        // c) Methods
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
    * Process a single ".group({ ... })" call, delegating to control extraction.
    *
    * @param callExpr      CallExpression for formBuilder.group(...).
    * @param validationMap Map to populate: controlName → validators[].
    */
    static processGroupCall(
        callExpr: CallExpression,
        validationMap: Map<string, string[]>
    ): void {
        logger.log('trace', '[LogicUtils] processGroupCall()');

        // Expect first arg to be an object literal of controls
        const controlsObj = callExpr.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
        if (!controlsObj) {
            logger.warn('[LogicUtils] processGroupCall – no object literal found');
            return;
        }

        this.processControlProperties(controlsObj, validationMap);
    }

    /**
    * For each "control: [initial, validators]" entry, extract validator text.
    *
    * Supported forms:
    *   • control: [ value, [ Validators.required, Validators.min(0) ] ]
    *   • control: [ value, Validators.required ]
    *
    * @param controlsObj   Object literal inside group({...}).
    * @param validationMap Output map to fill.
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

            // Only care for array initializer forms: [ value, validators ]
            if (initializer && initializer.isKind(SyntaxKind.ArrayLiteralExpression)) {
                const elements = initializer.getElements();
                const validatorsNode = elements.length > 1 ? elements[1] : undefined;
                let rules: string[] = [];

                // A) validators as an array literal
                if (validatorsNode && validatorsNode.isKind(SyntaxKind.ArrayLiteralExpression))
                    rules = this.collectValidatorsFromArray(validatorsNode);

                // B) single validator expression (e.g., Validators.required)
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
    * Collect validator snippets from an ArrayLiteralExpression.
    *
    * @param arrayLit Array literal node containing validator expressions.
    * @returns        Strings like "Validators.required", "Validators.min(0)".
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
    * Attach discovered validation rules to a WidgetInfo.
    *
    * Priority:
    *   1) Match by widget.attributes.formControlName
    *   2) Fallback: heuristic match using parts of widget.id
    *
    * @param widget        Target widget to decorate in-place.
    * @param validationMap ControlName → validators[].
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

        // Direct match via formControlName attribute
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

        // Heuristic fallback: search control name fragments in namespaced ID
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