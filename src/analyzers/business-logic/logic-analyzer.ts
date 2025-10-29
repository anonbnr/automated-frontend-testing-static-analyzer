// ──────────────────────────────────────────────────────────────────────────────
// analyzers/business-logic/logic-analyzer.ts
//
// Coordinates **business-logic** analysis of Angular components, either
// within a single file or across an entire ts-morph Project.
//
// Responsibilities:
//   1. Method scanning & form-validation extraction (via LogicUtils)
//   2. Widget event binding → EventContext construction
//   3. Assembly of WidgetEventMap outputs per interactive widget
//
// Entry points:
//   • analyze(file, widgets, routeMap): WidgetEventMap[]
//   • analyzeProject(project, componentRegistry, routeMap): WidgetEventMap[]
//
// Notes
//   • This analyzer only inspects static metadata (AST + template-derived info).
//     It does not execute application code.
//   • Logging is verbose (info/debug/trace) for troubleshooting.
//   • AnalyzerConfig tunes backend detection and noise filtering via LogicUtils.
// ──────────────────────────────────────────────────────────────────────────────

import { MethodDeclaration, Project, SourceFile } from 'ts-morph';
import logger from '../../logging/logger.js';
import { AnalyzerConfig, DEFAULT_ANALYZER_CONFIG } from '../../models/analyzer-config.js';
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
 * Pipeline (per component):
 *   1) Extract instance methods (for handler resolution)
 *   2) Extract form validation rules (formBuilder.group)
 *   3) For each widget:
 *        - Build EventContext for each bound event
 *        - Attach matching validation rules back onto the widget
 *   4) Emit one WidgetEventMap per widget that has at least one EventContext
 *
 * The analyzer is *purely static*: it uses ts-morph AST and previously
 * discovered template metadata (WidgetInfo from the template analyzer).
 */
export class LogicAnalyzer {
    /**
    * @param cfg Analyzer configuration (backend/noise heuristics).
    *            Defaults to DEFAULT_ANALYZER_CONFIG.
    */
    constructor(private cfg: AnalyzerConfig = DEFAULT_ANALYZER_CONFIG) { }

    // ────────────────────────────────────────────────────────────────────────────
    // 1) PROJECT-WIDE ANALYSIS
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Analyze **all** components in an Angular workspace.
    *
    * Steps:
    *   1. Iterate every SourceFile in the Project
    *   2. Locate the primary @Component class and its selector
    *   3. Match selector to ComponentInfo in the registry
    *   4. Flatten the widget forest (TemplateUtils.flattenWidgets)
    *   5. Delegate to analyze() for widget-level logic extraction
    *
    * @param project  ts-morph Project (the Angular workspace).
    * @param registry Precomputed ComponentRegistry with template-derived metadata.
    * @param routeMap Full RouteMap (used by LogicUtils to resolve nav targets).
    * @returns        Flat list of WidgetEventMap across the entire project.
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
            logger.log('trace', '[LogicAnalyzer] Inspecting file %s', sf.getFilePath());
            // 1) Primary @Component class (if none, skip file)
            const cls = AstUtils.getPrimaryComponentClass(sf);
            if (!cls) {
                logger.log('trace', '[LogicAnalyzer] No @Component class found in %s', sf.getFilePath());
                continue;
            }

            // 2) Resolve selector from decorator and look up matching ComponentInfo
            const dec = cls.getDecorator("Component");
            const selector = AstUtils.getSelectorFromDecorator(dec!) ?? '';
            const ci = registry.getBySelector(selector);
            if (!ci) {
                logger.warn('[LogicAnalyzer] No ComponentInfo for selector="%s"', selector);
                continue;
            }

            // 3) Flatten the component's widget hierarchy to a list
            const widgets = TemplateUtils.flattenWidgets(ci.widgets);
            logger.debug(
                '[LogicAnalyzer] Flattened %d widgets for component="%s"',
                widgets.length,
                selector
            );

            // 4) Per-file analysis: convert widgets → WidgetEventMap[]
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
    * Analyze one component's widgets within a single TypeScript file.
    *
    * @param file      SourceFile containing the component class.
    * @param widgets   Flat array of WidgetInfo describing discovered widgets.
    * @param routeMap  RouteMap used to resolve Router.navigate* calls.
    * @returns         One WidgetEventMap per widget that has at least one event.
    */
    analyze(
        file: SourceFile,
        widgets: WidgetInfo[],
        routeMap: RouteMap
    ): WidgetEventMap[] {
        const filePath = file.getFilePath();
        // 0) A primary @Component class must exist
        logger.info('[LogicAnalyzer] Starting per-component analysis for %s', filePath);
        const compClass = AstUtils.getPrimaryComponentClass(file);
        if (!compClass) {
            logger.warn('[LogicAnalyzer] No @Component in %s', filePath);
            return [];
        }

        // 1) Collect all instance methods (for handler resolution)
        logger.debug('[LogicAnalyzer] Extracting methods from component class');
        const methods = LogicUtils.extractMethods(compClass);
        logger.debug('[LogicAnalyzer] Found %d methods', methods.size);

        // 2) Extract formBuilder.group(...) validations
        logger.debug('[LogicAnalyzer] Extracting validation rules');
        const validationMap = LogicUtils.extractValidationRules(compClass);
        logger.debug(
            '[LogicAnalyzer] validationMap → %o',
            Array.from(validationMap.entries())
        );

        // 3) Analyze each widget in the flattened list
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
    * Analyze a single widget:
    *   • Build EventContext for each declared event using LogicUtils.buildEventContext
    *   • Attach form validation rules (if any) using LogicUtils.attachValidationRules
    *   • Return a WidgetEventMap only if at least one EventContext is produced
    *
    * @param widget         The WidgetInfo to analyze.
    * @param methods        Map of component method names → MethodDeclaration.
    * @param validationMap  ControlName → validators[] map.
    * @param routeMap       RouteMap for resolving navigation targets.
    * @returns              WidgetEventMap or undefined if the widget has no events.
    */
    private _analyzeWidget(
        widget: WidgetInfo,
        methods: Map<string, MethodDeclaration>,
        validationMap: Map<string, string[]>,
        routeMap: RouteMap
    ): WidgetEventMap | undefined {
        // 1) Convert each event binding into an EventContext (drop unresolvable)
        const eventContexts = Object.entries(widget.events)
            .map(([event, handler]) => LogicUtils.buildEventContext(event, handler!, methods, routeMap, this.cfg))
            .filter((ctx): ctx is EventContext => Boolean(ctx));

        // 2) Enrich widget with matching validation rules (in-place)
        LogicUtils.attachValidationRules(widget, validationMap);

        // 3) Emit only if we resolved at least one EventContext
        return eventContexts.length > 0
            ? { widgetID: widget.id, eventContexts }
            : undefined;
    }
}