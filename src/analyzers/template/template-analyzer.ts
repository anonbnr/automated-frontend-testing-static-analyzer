import { TmplAstElement, TmplAstNode, TmplAstTemplate } from '@angular/compiler';
import * as fs from 'fs';
import * as path from "path";
import * as ts from 'ts-morph';
import { ComponentInfo } from '../../models/component-info.js';
import { parseAngularTemplate } from '../../parsers/angular-template-parser.js';
import { WidgetProcessor } from './widgets/widget-processor.js';

/**
 * TemplateAnalyzer is responsible for analyzing Angular component templates.
 * It extracts widgets, identifies nested components, and retrieves the component selector.
 */
export class TemplateAnalyzer {
    /**
     * Constructs a TemplateAnalyzer instance.
     * @param decorator The TypeScript decorator for the component.
     */
    constructor(
        private decorator: ts.Decorator
    ) { }

    /**
     * Extracts the inline template or loads the external template file if specified.
     * @returns The template string if found, otherwise null.
     */
    extractTemplate(): string | null {
        const args = this.decorator.getArguments();

        if (args.length) {
            const objLiteral = args[0].asKind(ts.SyntaxKind.ObjectLiteralExpression);
            if (objLiteral) {
                const templateUrlProp = objLiteral.getProperty("templateUrl");
                if (templateUrlProp?.isKind(ts.SyntaxKind.PropertyAssignment)) {
                    const initializer = templateUrlProp.getInitializer();
                    if (initializer?.isKind(ts.SyntaxKind.StringLiteral)) {
                        // Resolve the full path of the template file
                        const componentFilePath = this.decorator.getSourceFile().getFilePath();
                        const componentDir = path.dirname(componentFilePath);
                        const templatePath = path.resolve(componentDir, initializer.getLiteralText());
                        try {
                            // Return the template's content
                            return fs.readFileSync(templatePath, "utf8");
                        } catch (err) {
                            console.error(`Template file not found: ${templatePath}`);
                            return null;
                        }
                    }
                }

                const templateProp = objLiteral.getProperty("template");
                if (templateProp?.isKind(ts.SyntaxKind.PropertyAssignment)) {
                    const initializer = templateProp.getInitializer();
                    if (initializer?.isKind(ts.SyntaxKind.StringLiteral))
                        return initializer.getLiteralText();
                }
            }
        }

        return null;
    }

    /**
     * Analyzes the given Angular template to extract widgets and nested components.
     * @param template The template string to analyze.
     * @returns A ComponentInfo object containing the extracted information.
     */
    async analyze(template: string): Promise<ComponentInfo> {
        const ast = await parseAngularTemplate(template);
        const processor = new WidgetProcessor(template);

        // Extract widgets from the template
        const widgets = processor.processWidgets(ast);

        console.log('Widgets: ', widgets);

        // Extract nested components
        const nestedComponents: string[] = [];
        const traverse = (nodes: TmplAstNode[]) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log('Element: ', node.name);
                    // FIXME: Better to do node.name not in AllHtmlTagsList
                    if (node.name.startsWith('app-')) {
                        nestedComponents.push(node.name);
                        // console.log(`Nested Component Found: ${node.name}`);
                    }

                    // Traverse children nodes
                    traverse(node.children);
                } else if (node instanceof TmplAstTemplate) {
                    // console.log('Template (structural directive): *ngIf, *ngFor, etc.');
                    // Traverse children of the template
                    traverse(node.children);
                }
            });
        };
        traverse(ast);

        // Fetch the selector of the component
        const selector = this.decorator
            .getArguments()[0]
            ?.asKind(ts.SyntaxKind.ObjectLiteralExpression)
            ?.getProperty('selector')
            ?.asKind(ts.SyntaxKind.PropertyAssignment)
            ?.getInitializer()
            ?.getText()
            ?.replace(/['"`]/g, '');

        if (!selector)
            throw new Error('Component selector could not be extracted.');

        // console.log(`Component: ${selector}, Nested Components: ${nestedComponents}`);

        return {
            selector,
            widgets,
            nestedComponents,
        };
    }
}