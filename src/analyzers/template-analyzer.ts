import { TmplAstElement, TmplAstNode, TmplAstTemplate } from '@angular/compiler';
import * as fs from 'fs';
import * as path from "path";
import * as ts from 'ts-morph';
import { ComponentInfo } from '../models/component-info.js';
import { parseAngularTemplate } from '../parsers/angular-template-parser.js';
import { WidgetProcessor } from '../utils/widget-processor.js';

export class TemplateAnalyzer {
    constructor(
        private decorator: ts.Decorator
    ) { }

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

    async analyze(template: string): Promise<ComponentInfo> {
        const ast = await parseAngularTemplate(template);
        const processor = new WidgetProcessor(template);

        // Extract widgets
        const widgets = processor.processWidgets(ast);

        // Extract nested components
        const nestedComponents: string[] = [];
        const traverse = (nodes: TmplAstNode[]) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log('Element: ', node.name);
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

        // Fetch the selector from the decorator
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