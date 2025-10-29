// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/template-analyzer.ts
//
// Purpose
//   Analyze a single Angular component template and produce its ComponentInfo:
//     • selector & class name
//     • full widget forest (WidgetInfo[]) with hierarchy
//     • deduped nested component selectors (<app-*>)
//
// Pipeline
//   1) Selector & class    → AstUtils (from @Component and its class)
//   2) Template resolution → (done by caller) pass raw template text
//   3) AST parsing         → TemplateUtils.parseTemplateToAst(template)
//   4) Widget extraction   → TemplateUtils.extractWidgetsFromAst(decorator, ast, template)
//   5) Nested components   → TemplateUtils.extractNestedComponentsFromAst(ast)
//
// Notes
//   • Throws if selector or class name cannot be inferred.
//   • Logging is verbose by design to aid troubleshooting.
// ──────────────────────────────────────────────────────────────────────────────

import { Decorator } from 'ts-morph';
import logger from '../../logging/logger.js';
import { ComponentInfo } from '../../models/component-info.js';
import { AstUtils } from '../../parsers/ast-utils.js';
import { TemplateUtils } from './template-utils.js';

/**
 * Analyzes an Angular component's template to build its ComponentInfo:
 *   - selector & class name
 *   - list of interactive WidgetInfo (hierarchical)
 *   - list of nested <app-*> component selectors (deduped)
 */
export class TemplateAnalyzer {
    /**
    * @param decorator The ts-morph `Decorator` for `@Component(...)`.
    */
    constructor(private decorator: Decorator) { }

    /**
    * Run the analysis pipeline for the given template text.
    *
    * Steps:
    *  1. Extract selector and class name via AST utils.
    *  2. Parse template string into Angular AST.
    *  3. Extract interactive widgets (WidgetProcessor via TemplateUtils).
    *  4. Discover nested `<app-*>` selectors (deduped).
    *
    * @param template The full template text (inline or file-loaded by caller).
    * @returns A ComponentInfo describing this component.
    * @throws If the decorator lacks a selector or if class name cannot be inferred.
    */
    async analyze(template: string): Promise<ComponentInfo> {
        logger.info(
            `[TemplateAnalyzer] Starting analysis for component in file %s`,
            this.decorator.getSourceFile().getFilePath()
        );

        // 1) Selector from @Component decorator
        const selector = AstUtils.getSelectorFromDecorator(this.decorator);
        logger.debug(`[TemplateAnalyzer] selector → %o`, selector);
        if (!selector) {
            logger.error(
                "[TemplateAnalyzer] Missing 'selector' on @Component decorator"
            );
            throw new Error("[TemplateAnalyzer] Missing 'selector' from the @Component decorator");
        }

        // 2) Class name from parent ClassDeclaration
        const name = AstUtils.getClassNameFromDecorator(this.decorator);
        logger.debug(`[TemplateAnalyzer] class name → %o`, name);
        if (!name) {
            logger.error(
                `[TemplateAnalyzer] Unable to infer class name from @Component decorator`
            );
            throw new Error('[TemplateAnalyzer] Unable to infer class name from @Component decorator.');
        }

        // 3) Parse the template into an AST
        logger.info(`[TemplateAnalyzer] Parsing template into Angular AST…`);
        const ast = await TemplateUtils.parseTemplateToAst(template);
        logger.info(
            `[TemplateAnalyzer] Parsed AST with %d top-level nodes`,
            ast.length
        );

        // 4) Extract interactive widgets
        logger.info(`[TemplateAnalyzer] Extracting widgets for selector='%s'…`, selector);
        const widgets = TemplateUtils.extractWidgetsFromAst(this.decorator, ast, template);
        logger.info(
            `[TemplateAnalyzer] Extracted %d widget trees`,
            widgets.length
        );

        // 5) Extract any nested <app-*> selectors (deduped)
        logger.info(
            `[TemplateAnalyzer] Extracting nested <app-*> selectors…`
        );
        const nestedComponents = TemplateUtils.extractNestedComponentsFromAst(ast);
        logger.info(
            `[TemplateAnalyzer] Found %d nested components: %o`,
            nestedComponents.length,
            nestedComponents
        );

        logger.info(
            `[TemplateAnalyzer] Analysis complete for selector='%s', class='%s'`,
            selector,
            name
        );

        // Return a snapshot consistent with models/component-info.ts
        return { selector, name, widgets, nestedComponents };
    }
}