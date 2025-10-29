// ──────────────────────────────────────────────────────────────────────────────
// analyzers/template/template-utils.ts
//
// Purpose
//   Static utilities used by the template analyzer to resolve templates,
//   parse them into Angular AST nodes, extract widgets, and post-process
//   widget trees (flattening, nested-component discovery).
//
// Provided utilities
//   1) Template resolution
//      - extractTemplate     : prefer external templateUrl; fallback to inline template
//      - getTemplateUrl      : resolve and read file referenced by `templateUrl`
//      - getInlineTemplate   : read inline `template` property
//   2) AST parsing
//      - parseTemplateToAst  : delegate to AngularTemplateParser
//   3) Widget extraction
//      - extractWidgetsFromAst : run WidgetProcessor to build WidgetInfo[]
//   4) Widget-tree helpers
//      - flattenWidgets      : depth-first flattening of WidgetInfo trees
//   5) Nested component discovery
//      - extractNestedComponentsFromAst : find all `<app-*>` tags
//
// Notes
//   • `extractTemplate` returns the raw template text; it does not attempt minification.
//   • `parseTemplateToAst` is async to match the parser's contract.
//   • All traversal helpers are careful to descend into `<ng-template>` nodes.
// ──────────────────────────────────────────────────────────────────────────────

import { TmplAstElement, TmplAstNode, TmplAstTemplate } from "@angular/compiler";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { Decorator } from "ts-morph";
import logger from "../../logging/logger.js";
import { WidgetInfo } from "../../models/widget-info.js";
import { AstUtils } from "../../parsers/ast-utils.js";
import { AngularTemplateParser } from "../../parsers/template-parser.js";
import { WidgetProcessor } from "./widgets/widget-processor.js";

/**
 * Static utility functions for resolving, parsing, and traversing Angular templates.
 */
export class TemplateUtils {
    // ──────────────── 1) Template resolution ──────────────────

    /**
    * Reads either an external template via `templateUrl` or an inline `template`
    * from a `@Component` decorator (external preferred).
    *
    * @param decorator The `@Component(...)` decorator node.
    * @returns The template text, or `undefined` if not present / not readable.
    */
    static extractTemplate(decorator: Decorator): string | undefined {
        logger.debug(
            `[TemplateUtils] extractTemplate for decorator in %s`,
            decorator.getSourceFile().getFilePath()
        );
        const urlText = this.getTemplateUrl(decorator);
        if (urlText) {
            logger.debug(`[TemplateUtils] Using external template (templateUrl)`);
            return urlText;
        }

        const inline = this.getInlineTemplate(decorator);
        logger.debug(
            `[TemplateUtils] Using inline template: %s`,
            inline ? "(present)" : "(none)"
        );
        return inline;
    }

    /**
    * If `templateUrl: '...'` is present, resolves and reads that file.
    *
    * @param decorator The `@Component(...)` decorator node.
    * @returns The file contents, or `undefined` if absent or unreadable.
    */
    static getTemplateUrl(decorator: Decorator): string | undefined {
        // Retrieve the template's relative URL
        const relative = AstUtils.getPropertyFromDecorator(decorator, 'templateUrl');
        if (!relative)
            return undefined;

        // Build the absolute path of that template
        const sourceFile = decorator.getSourceFile().getFilePath();
        const fullPath = resolve(dirname(sourceFile), relative);
        try {
            // Return the template's content
            logger.log('trace', `[TemplateUtils] Reading templateUrl from %s`, fullPath);
            return readFileSync(fullPath, "utf8");
        } catch (err) {
            logger.error(
                `[TemplateUtils] Unable to read templateUrl at "%s": %o`,
                fullPath,
                err
            );
            return undefined;
        }
    }

    /**
    * Reads an inline `template: '...'` from a `@Component` decorator.
    *
    * @param decorator The `@Component(...)` decorator node.
    * @returns The inline template text, or `undefined` if not present.
    */
    static getInlineTemplate(decorator: Decorator): string | undefined {
        logger.log(
            'trace',
            `[TemplateUtils] Checking for inline 'template' property…`
        );
        return AstUtils.getPropertyFromDecorator(decorator, 'template');
    }

    // ──────────────── 2) AST parsing ──────────────────

    /**
    * Parses a template string into Angular template AST nodes.
    *
    * @param template Raw template text.
    * @returns Promise resolving to the parsed `TmplAstNode[]`.
    */
    static async parseTemplateToAst(template: string): Promise<TmplAstNode[]> {
        logger.debug(`[TemplateUtils] Parsing template string to AST…`);
        const ast = await new AngularTemplateParser().parse(template);
        logger.log(
            'trace',
            `[TemplateUtils] parseTemplateToAst → AST nodes count: %d`,
            ast.length
        );

        return ast;
    }

    // ──────────────── 3) Widget extraction ──────────────────

    /**
    * Extracts all interactive widgets from a parsed Angular AST.
    *
    * @param decorator The `@Component(...)` decorator node (to obtain selector).
    * @param ast       Parsed template AST nodes.
    * @param template  Original template text (enables precise handler extraction).
    * @returns Array of `WidgetInfo` roots (each with `children` filled).
    */
    static extractWidgetsFromAst(decorator: Decorator, ast: TmplAstNode[], template: string) {
        const selector = AstUtils.getSelectorFromDecorator(decorator) ?? '<unknown>';
        logger.log(
            'trace',
            `[TemplateUtils] extractWidgetsFromAst for selector='%s'`,
            selector
        );

        const processor = new WidgetProcessor(template);
        const widgets = processor.processWidgets(ast, selector);
        logger.info(
            `[TemplateUtils] Widgets found for '%s': %d widget trees`,
            selector,
            widgets.length
        );
        return widgets;
    }

    // ──────────────── 4) Widget-tree helpers ──────────────────

    /**
    * Flattens a nested array of `WidgetInfo` into a single depth-first list.
    *
    * @param tree Top-level widget hierarchies.
    * @returns Every widget in the tree, depth-first order.
    */
    static flattenWidgets(tree: WidgetInfo[]): WidgetInfo[] {
        logger.log(
            'trace',
            `[TemplateUtils] flattenWidgets: tree with %d roots`,
            tree.length
        );
        const flattened: WidgetInfo[] = [];

        const walk = (widgets: WidgetInfo[]) => {
            for (const w of widgets) {
                flattened.push(w);
                if (w.children?.length)
                    walk(w.children);
            }
        };

        walk(tree);
        logger.log(
            'trace',
            `[TemplateUtils] flattenWidgets → total ${flattened.length}`
        );
        return flattened;
    }

    // ──────────────── 5) Nested component discovery ──────────────────

    /**
    * Recursively finds all `<app-*>` selectors in the AST (including under `<ng-template>`).
    *
    * @param ast Parsed template AST nodes.
    * @returns Deduplicated list of nested component selectors (as they appear in the template).
    */
    static extractNestedComponentsFromAst(ast: TmplAstNode[]): string[] {
        logger.log(
            'trace',
            `[TemplateUtils] extractNestedComponentsFromAst: walking AST of length %d`,
            ast.length
        );
        const seen = new Set<string>();

        const walk = (nodes: TmplAstNode[]) => {
            for (const node of nodes) {
                if (node instanceof TmplAstElement) {
                    const tag = node.name.toLowerCase();
                    if (tag.startsWith('app-')) {
                        logger.log('trace', `[TemplateUtils] Found nested component tag: %s`, node.name);
                        // Keep original casing as found in the template
                        seen.add(node.name);
                    }

                    // Always descend into children
                    walk(node.children);
                }
                else if (node instanceof TmplAstTemplate) {
                    // Structural directives (e.g., *ngIf, *ngFor) appear as TmplAstTemplate
                    walk(node.children);
                }
            }
        };

        walk(ast);
        const nested = Array.from(seen);
        logger.info(
            `[TemplateUtils] Nested components deduped list: %o`,
            nested
        );
        return nested;
    }
}