// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/template-analyzer.ts
//
// Analyzes an Angular component’s template to produce a ComponentInfo.
// 
// 1. **Selector & class**
//    - Reads the component’s `selector` and class `name` from the decorator.
//
// 2. **Template resolution**
//    - (Outside responsibility) template text is passed in, having been
//      loaded via inline `template` or `templateUrl`.
//
// 3. **AST parsing**
//    - Delegates to `TemplateUtils.parseTemplateToAst`.
//
// 4. **Widget extraction**
//    - Uses `TemplateUtils.extractWidgetsFromAst` to collect all interactive widgets.
//
// 5. **Nested components**
//    - Uses `TemplateUtils.extractNestedComponentsFromAst` to find `<app-*>` tags.
// ──────────────────────────────────────────────────────────────────────────────

import { Decorator } from 'ts-morph';
import logger from '../../logging/logger.js';
import { ComponentInfo } from '../../models/component-info.js';
import { AstUtils } from '../../parsers/ast-utils.js';
import { TemplateUtils } from './template-utils.js';

/**
 * Analyzes an Angular component’s template to build its ComponentInfo:
 *   - selector & class name
 *   - list of interactive WidgetInfo
 *   - list of nested component selectors
 */
export class TemplateAnalyzer {
    /**
     * Create a TemplateAnalyzer for a given `@Component({...})` decorator.
     * @param decorator   The ts-morph `Decorator` `@Component(...)` decorator node.
     */
    constructor(private decorator: Decorator) { }

    /**
   * Runs the template analysis pipeline:
   *  1. Reads `selector` and class `name` via AST utils.
   *  2. Parses the provided template string into an Angular AST.
   *  3. Extracts every interactive widget.
   *  4. Discovers any nested `<app-*>` selectors.
   *
   * @param template  The full template text (inline or file-loaded).
   * @returns         A Promise resolving to the component’s `ComponentInfo`.
   * @throws          If the decorator lacks a `selector` or class name.
   */
    async analyze(template: string): Promise<ComponentInfo> {
        logger.info(
            `[TemplateAnalyzer] Starting analysis for component in file %s`,
            this.decorator.getSourceFile().getFilePath()
        );

        // 1) Extract selector from @Component decorator
        const selector = AstUtils.getSelectorFromDecorator(this.decorator);
        logger.debug(`[TemplateAnalyzer] selector → %o`, selector);
        if (!selector) {
            logger.error(
                "[TemplateAnalyzer] Missing 'selector' on @Component decorator"
            );
            throw new Error("[TemplateAnalyzer] Missing 'selector' from the @Component decorator");
        }

        // 2) Compute the class name from the parent ClassDeclaration
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
        return { selector, name, widgets, nestedComponents };
    }
}