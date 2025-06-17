// ──────────────────────────────────────────────────────────────────────────────
// template-analyzer.ts
//
// A `TemplateAnalyzer` that:
//
//   1) Given a `@Component({...})` decorator, figures out whether the component
//      uses `templateUrl` (in which case it reads that file) or an inline `template`.
//      Returns the full template string (or `null` if none is found).
//
//   2) Extracts the component’s own `selector: 'app-…'` and the TS class’s name
//      (e.g. `HeaderComponent`) directly from the `@Component` decorator and its
//      parent `ClassDeclaration`.
//
//   3) Parses that template into an Angular AST (via `AngularTemplateParser`), then:
//         - Pulls out all “interactive widgets” (buttons, inputs, anchors, forms, etc.)
//           via a `WidgetProcessor`.
//         - Recursively finds any nested `<app-*>` tags—even under `*ngIf`, `*ngFor`,
//           or other structural directives—collecting each selector into a deduped list.
//
// The final `ComponentInfo` contains:
//   - selector:        string           // e.g. “app-my-header”
//   - name:            string           // e.g. “MyHeaderComponent”
//   - widgets:         WidgetInfo[]     // all interactive widgets the template defines
//   - nestedComponents:string[]         // deduped list of any <app-*> tags referenced
// ──────────────────────────────────────────────────────────────────────────────

import { TmplAstElement, TmplAstNode, TmplAstTemplate } from '@angular/compiler';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { Decorator, ObjectLiteralExpression, SyntaxKind } from 'ts-morph';
import { ComponentInfo } from '../../models/component-info.js';
import { AngularTemplateParser, TemplateParser } from '../../parsers/template-parser.js';
import { WidgetProcessor } from './widgets/widget-processor.js';
import { LogicUtils } from '../business-logic/logic-utils.js';

/**
 * TemplateAnalyzer is responsible for:
 *
 *   1) Determining if a component uses `templateUrl` (reading that file), or an inline
 *      `template: '...'`.  Returns the full template text (or `null` if absent).
 *
 *   2) Extracting the component’s own `selector` (e.g. `app-header`) and class `name`
 *      (e.g. `HeaderComponent`) from the decorator.
 *
 *   3) Parsing the template into an Angular AST, then:
 *        - Extracting all interactive widgets (buttons, inputs, anchors, forms, etc.)
 *          via `WidgetProcessor`.
 *        - Finding any nested `<app-*>` tags—even inside `*ngIf`/`*ngFor`—and collecting
 *          them into a deduped array.
 *
 * The resulting `ComponentInfo` contains:
 *   - selector:        string
 *   - name:            string
 *   - widgets:         WidgetInfo[]
 *   - nestedComponents:string[]
 */
export class TemplateAnalyzer {
    /**
     * Create a TemplateAnalyzer for a given `@Component({...})` decorator.
     * @param decorator   The ts-morph `Decorator` node corresponding to `@Component(...)`.
     */
    constructor(private decorator: Decorator) { }

    /**
     * Public entrypoint: given an Angular template string (either inline or loaded from disk):
     *   1) Extracts `selector` (e.g. `app-header`) and `name` (e.g. `HeaderComponent`)
     *      from the decorator.
     *   2) Parses the template into an Angular AST.
     *   3) Extracts all interactive widgets via `WidgetProcessor`.
     *   4) Recursively finds nested `<app-*>` tags (including under `*ngIf`, `*ngFor`).
     *
     * @param template   The full Angular template text.
     * @returns          A Promise resolving to `ComponentInfo`.
     * @throws           If either `selector` or class `name` cannot be determined.
     */
    async analyze(template: string): Promise<ComponentInfo> {
        // 1) Extract selector from @Component decorator
        const selector = this._getSelectorFromDecorator();
        if (!selector)
            throw new Error('[TemplateAnalyzer] Unable to extract `selector` from the @Component decorator.');

        // 2) Compute the class name from the parent ClassDeclaration
        const name = this._getClassNameFromDecorator();
        if (!name)
            throw new Error('[TemplateAnalyzer] Unable to extract class name from the @Component decorator.');

        // 3) Parse the template into an AST
        const ast = await this._parseTemplateToAst(template);

        // 4) Extract interactive widgets (buttons, inputs, anchors, forms, etc.)
        const widgets = this._extractWidgetsFromAst(ast, template);

        // 5) Extract any nested <app-*> selectors (deduped)
        const nestedComponents = this._extractNestedComponentsFromAst(ast);

        return {
            selector,
            name,
            widgets,
            nestedComponents,
        };
    }

    //
    // ──────────────── 1) TEMPLATE PARSING HELPERS ──────────────────
    //

    /**
    * Determines whether to read from `templateUrl` or inline `template`.
    * @returns The template text, or null if neither is present.
    */
    extractTemplate(): string | null {
        // 1) Get the object literal expression passed to the decorator
        const objLiteral = this._getComponentObjectLiteral();
        // Not an object literal → can’t extract anything
        if (!objLiteral)
            return null;

        // 2) If there's a templateUrl property, read that file
        const urlText = this._getTemplateUrl(objLiteral);
        if (urlText !== null)
            return urlText;

        // 3) Otherwise, look for an inline `template: '...'`
        const inlineText = this.getInlineTemplate(objLiteral);
        return inlineText;
    }

    /** Locates and returns the ObjectLiteralExpression passed to @Component(...) */
    private _getComponentObjectLiteral(): ObjectLiteralExpression | null | undefined {
        const args = this.decorator.getArguments();
        if (!args || args.length === 0)
            return null;

        const firstArg = args[0];
        return firstArg.asKind(SyntaxKind.ObjectLiteralExpression);
    }

    /**
     * If `templateUrl: '...'` exists, resolves and loads that file,
     * returning its contents or null on failure.
     */
    private _getTemplateUrl(objLiteral: ObjectLiteralExpression): string | null {
        const templateUrlProp = objLiteral.getProperty("templateUrl");
        if (templateUrlProp && templateUrlProp.isKind(SyntaxKind.PropertyAssignment)) {
            const initializer = templateUrlProp.getInitializer();
            if (initializer && initializer.isKind(SyntaxKind.StringLiteral)) {
                // Build the absolute path of that template
                const relative = initializer.getLiteralText();
                const componentFilePath = this.decorator.getSourceFile().getFilePath();
                const componentDir = dirname(componentFilePath);
                const fullPath = resolve(componentDir, relative);
                try {
                    // Return the template's content
                    return readFileSync(fullPath, "utf8");
                } catch (err) {
                    console.error(`[TemplateAnalyzer] Failed to read templateUrl at "${fullPath}".`);
                    return null;
                }
            }
        }
        return null;
    }

    /**
   * If `template: '<div>..</div>'` is found inline, returns the literal text.
   */
    private getInlineTemplate(objLiteral: ObjectLiteralExpression): string | null {
        const templateProp = objLiteral.getProperty("template");
        if (templateProp && templateProp.isKind(SyntaxKind.PropertyAssignment)) {
            const initializer = templateProp.getInitializer();
            if (initializer && initializer.isKind(SyntaxKind.StringLiteral))
                return initializer.getLiteralText();
        }
        return null;
    }

    /**
     * Delegates to `AngularTemplateParser` so we get an array of `TmplAstNode`.
     */
    private async _parseTemplateToAst(template: string): Promise<TmplAstNode[]> {
        const parser: TemplateParser = new AngularTemplateParser();
        return await parser.parse(template);
    }

    //
    // ──────────────── 2) WIDGET EXTRACTION HELPER ──────────────────
    //

    /**
     * Walks the AST with a `WidgetProcessor` to extract all interactive widgets
     * (buttons, inputs, anchors, forms, etc.). Calls out to the `WidgetProcessor`,
     * passing along the original `template` source so it can slice-out handler spans.
     */
    private _extractWidgetsFromAst(ast: TmplAstNode[], template: string) {
        const processor = new WidgetProcessor(template);
        const widgets = processor.processWidgets(ast);
        const componentSelector = LogicUtils.getSelectorFromDecorator(this.decorator);
        console.log(`[TemplateAnalyzer] Widgets found for ${componentSelector}:`, widgets);
        return widgets;
    }

    //
    // ──────────────── 3) NESTED COMPONENT DETECTION ───────────────────
    //

    /**
     * Recursively scans the AST looking for any `<app-*` tags, including inside
     * TmplAstTemplate nodes (structural directives like *ngIf, *ngFor, etc.).
     * @returns A deduped array of each component selector found.
     */
    private _extractNestedComponentsFromAst(ast: TmplAstNode[]): string[] {
        const nestedSet = new Set<string>();

        const walk = (nodes: TmplAstNode[]) => {
            for (const node of nodes) {
                if (node instanceof TmplAstElement) {
                    const tagName = node.name.toLowerCase();
                    if (tagName.startsWith('app-'))
                        nestedSet.add(node.name);
                    
                    // Always descend into children
                    walk(node.children);
                }
                else if (node instanceof TmplAstTemplate) {
                    // Structural directives (e.g. `*ngIf`, `*ngFor`) appear as TmplAstTemplate,
                    // so we descend into their children as well:
                    walk(node.children);
                }
            }
        };

        walk(ast);
        return Array.from(nestedSet);
    }

    //
    // ──────────────── 4) SELECTOR & CLASS NAME HELPERS ──────────────────
    //

    /**
     * Reads `selector: 'app-my-component'` from the `@Component` decorator’s object literal.
     * @returns The string without quotes, or null if not found.
     */
    private _getSelectorFromDecorator(): string | null {
        const objLiteral = this._getComponentObjectLiteral();
        if (!objLiteral)
            return null;

        const selProp = objLiteral.getProperty('selector');
        if (!selProp || !selProp.isKind(SyntaxKind.PropertyAssignment))
            return null;

        const initializer = selProp.getInitializer();
        if (!initializer || !initializer.isKind(SyntaxKind.StringLiteral))
            return null;

        return initializer.getLiteralText();
    }

    /**
     * Infers the class name by navigating up from the decorator to its parent `ClassDeclaration`.
     * E.g. for:
     *    @Component({...})
     *    export class MyWidgetComponent { … }
     * We return "MyWidgetComponent".
     */
    private _getClassNameFromDecorator(): string | null {
        const cls = this.decorator.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
        if (cls)
            return cls.getName() || null;

        return null;
    }
}