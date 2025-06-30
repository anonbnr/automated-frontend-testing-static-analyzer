// ──────────────────────────────────────────────────────────────────────────────
// analyzers/business-logic/logic-analyzer.ts
//
// Coordinates **business-logic** analysis of Angular components, either
// within a single file or across an entire ts-morph Project.
//
// Responsibilities:
//   1. Method scanning & form-validation extraction (LogicUtils)
//   2. Widget event binding → `EventContext` construction
//   3. Assembly of `WidgetEventMap` outputs for each interactive widget
//
// Entry points:
//   - `analyze(file, widgets, routeMap): WidgetEventMap[]`
//   - `analyzeProject(project, componentRegistry, routeMap): WidgetEventMap[]`
// ──────────────────────────────────────────────────────────────────────────────

import { MethodDeclaration, Project, SourceFile } from 'ts-morph';
import logger from '../../logging/logger.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { EventContext, WidgetEventMap } from '../../models/event-info.js';
import { RouteMap } from '../../models/route-info.js';
import { WidgetInfo } from '../../models/widget-info.js';
import { AstUtils } from '../../parsers/ast-utils.js';
import { TemplateUtils } from '../template/template-utils.js';
import { LogicUtils } from './logic-utils.js';

/**
 * Orchestrates business-logic analysis of Angular components.
 *
 * Uses `LogicUtils` to:
 *  - extract component methods & validation rules
 *  - build `EventContext` objects for each widget event
 *  - attach form validations back to the widgets
 *
 * Produces a flat list of `WidgetEventMap`s that downstream
 * graph builders will consume to wire up dynamic transitions.
 */
export class LogicAnalyzer {
    // ────────────────────────────────────────────────────────────────────────────
    // 1) PROJECT-WIDE ANALYSIS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Analyze **all** components in an Angular workspace.
     *
     * Steps:
     *  1. Iterate every `SourceFile` in `project`
     *  2. Locate primary `@Component` class and its `selector`
     *  3. Match selector to `ComponentInfo` from `registry`
     *  4. Flatten its widget tree via `TemplateUtils.flattenWidgets`
     *  5. Delegate to `analyze()` for widget-level logic
     *
     * @param project
     *   The ts-morph `Project` representing the Angular workspace.
     * @param registry
     *   Precomputed `ComponentRegistry` with template-derived metadata.
     * @param routeMap
     *   The full `RouteMap` for resolving dynamic routes.
     * @returns
     *   An array of `WidgetEventMap`, one per widget across the project.
     */
    analyzeProject(
        project: Project,
        registry: ComponentRegistry,
        routeMap: RouteMap
    ): WidgetEventMap[] {
        logger.info('[LogicAnalyzer] Starting project-wide business-logic analysis');
        const widgetEventMaps: WidgetEventMap[] = [];
        const files = project.getSourceFiles();
        logger.debug('[LogicAnalyzer] Project contains %d source files', files.length);

        for (const sf of files) {
            // 1) Primary @Component class
            logger.log('trace', '[LogicAnalyzer] Inspecting file %s', sf.getFilePath());
            const cls = AstUtils.getPrimaryComponentClass(sf);
            if (!cls) {
                logger.log('trace', '[LogicAnalyzer] No @Component class found in %s', sf.getFilePath());
                continue;
            }

            // 2) Extract selector and find matching ComponentInfo
            const dec = cls.getDecorator("Component");
            const selector = AstUtils.getSelectorFromDecorator(dec!) ?? '';
            const ci = registry.getBySelector(selector);
            if (!ci) {
                logger.warn('[LogicAnalyzer] No ComponentInfo for selector="%s"', selector);
                continue;
            }

            // 4) Flatten widget hierarchy
            const widgets = TemplateUtils.flattenWidgets(ci.widgets);
            logger.debug(
                '[LogicAnalyzer] Flattened %d widgets for component="%s"',
                widgets.length,
                selector
            );

            // 5) Widget-level analysis
            const mapsBefore = widgetEventMaps.length;
            widgetEventMaps.push(...this.analyze(sf, widgets, routeMap));
            const newMaps = widgetEventMaps.length - mapsBefore;
            logger.info(
                '[LogicAnalyzer] Extracted %d WidgetEventMap for "%s"',
                newMaps,
                selector
            );
        }

        logger.info(
            '[LogicAnalyzer] Completed business-logic analysis: %d total WidgetEventMap',
            widgetEventMaps.length
        );

        return widgetEventMaps;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 2) PER-COMPONENT ANALYSIS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Analyze one component’s widgets within a single TypeScript file.
     *
     * @param file
     *   The `SourceFile` containing the component’s class.
     * @param widgets
     *   Flat array of `WidgetInfo` describing its interactive elements.
     * @param routeMap
     *   The `RouteMap` used to resolve any router navigations.
     * @returns
     *   A list of `WidgetEventMap`, one per widget that declares at least one event.
     */
    analyze(
        file: SourceFile,
        widgets: WidgetInfo[],
        routeMap: RouteMap
    ): WidgetEventMap[] {
        const filePath = file.getFilePath();
        // 0) Primary @Component class must exist
        logger.info('[LogicAnalyzer] Starting per-component analysis for %s', filePath);
        const compClass = AstUtils.getPrimaryComponentClass(file);
        if (!compClass) {
            logger.warn('[LogicAnalyzer] No @Component in %s', filePath);
            return [];
        }

        // 1) Collect all instance methods
        logger.debug('[LogicAnalyzer] Extracting methods from component class');
        const methods = LogicUtils.extractMethods(compClass);
        logger.debug('[LogicAnalyzer] Found %d methods', methods.size);

        // 2) Pull out any formBuilder.group(...) validations
        logger.debug('[LogicAnalyzer] Extracting validation rules');
        const validationMap = LogicUtils.extractValidationRules(compClass);
        logger.debug(
            '[LogicAnalyzer] validationMap → %o',
            Array.from(validationMap.entries())
        );

        // 3) Process each widget
        const result = widgets
            .map(widget => this._analyzeWidget(widget, methods, validationMap, routeMap))
            .filter((map): map is WidgetEventMap => Boolean(map));

        logger.info(
            '[LogicAnalyzer] Completed per-component analysis for %s → %d WidgetEventMap',
            filePath,
            result.length
        );

        return result;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 3) WIDGET-LEVEL ANALYSIS
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Analyze a single `WidgetInfo`:
     *  - Wire up each declared event to an `EventContext`
     *  - Attach any form validation rules
     *
     * @param widget
     *   The `WidgetInfo` to analyze.
     * @param methods
     *   Map of component method names → their AST nodes.
     * @param validationMap
     *   ControlName → validators[] map.
     * @param routeMap
     *   For resolving `router.navigate` calls.
     * @returns
     *   A `WidgetEventMap` if the widget has any events, otherwise `undefined`.
     */
    private _analyzeWidget(
        widget: WidgetInfo,
        methods: Map<string, MethodDeclaration>,
        validationMap: Map<string, string[]>,
        routeMap: RouteMap
    ): WidgetEventMap | undefined {
        // 1) Build EventContext objects for each declared event
        const eventContexts = Object.entries(widget.events)
            .map(([event, handler]) => LogicUtils.buildEventContext(event, handler!, methods, routeMap))
            .filter((ctx): ctx is EventContext => Boolean(ctx));

        // 2) Attach any matching validation rules back onto the widget
        LogicUtils.attachValidationRules(widget, validationMap);

        // 3) Only include widgets that have at least one event context
        return eventContexts.length > 0
            ? { widgetID: widget.id, eventContexts }
            : undefined;
    }
}