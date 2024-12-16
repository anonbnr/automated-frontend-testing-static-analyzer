import * as fs from 'fs';
import * as path from "path";
import * as ts from 'ts-morph';
import { WidgetInfo } from '../models/widget-info.js';
import { parseAngularTemplate } from '../parsers/angular-template-parser.js';
import { WidgetIDGenerator } from '../utils/widget-id-generator.js';
import { WidgetProcessor } from '../utils/widget-processor.js';

export class TemplateAnalyzer {
    extractTemplate(decorator: ts.Decorator): string | null {
        const args = decorator.getArguments();

        if (args.length) {
            const objLiteral = args[0].asKind(ts.SyntaxKind.ObjectLiteralExpression);
            if (objLiteral) {
                const templateUrlProp = objLiteral.getProperty("templateUrl");
                if (templateUrlProp?.isKind(ts.SyntaxKind.PropertyAssignment)) {
                    const initializer = templateUrlProp.getInitializer();
                    if (initializer?.isKind(ts.SyntaxKind.StringLiteral)) {
                        // Resolve the full path of the template file
                        const componentFilePath = decorator.getSourceFile().getFilePath();
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

    async analyze(template: string): Promise<WidgetInfo[]> {
        const ast = await parseAngularTemplate(template);
        const processor = new WidgetProcessor(new WidgetIDGenerator(), template);
        return processor.processWidgets(ast);
    }
}