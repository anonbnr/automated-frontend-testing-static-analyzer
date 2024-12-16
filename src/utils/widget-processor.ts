import { AST, TmplAstElement, TmplAstNode } from "@angular/compiler";
import { WidgetInfo } from "../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";

export class WidgetProcessor {
    private idGenerator: WidgetIDGenerator;
    private templateSource: string; // Full source code of the template

    constructor(idGenerator: WidgetIDGenerator, templateSource: string) {
        this.idGenerator = idGenerator;
        this.templateSource = templateSource;
    }

    processWidgets(nodes: TmplAstNode[]): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];
        const targetTags = new Set(['button', 'input', 'a', 'form', 'select', 'textarea']);

        const traverse = (nodes: TmplAstNode[]) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log(`Processing node: ${node.name}`);
                    // Process only targeted widgets
                    if (targetTags.has(node.name.toLowerCase())) {
                        // console.log(`Detected widget: ${node.name}`);
                        const id = node.attributes.find((attr) => attr.name === 'id')?.value
                            || this.idGenerator.generateID(node);
                        const events = new Map<string, string>();

                        // Extract routerLink for anchors
                        if (node.name.toLowerCase() === 'a') {
                            const anchorAttr = node.attributes.find(attr => attr.name === 'routerLink');
                            if (anchorAttr)
                                events.set(anchorAttr.name, anchorAttr.value);
                        }

                        node.outputs.forEach(output => {
                            const handler = this.extractHandler(output.handler);
                            events.set(output.name, handler);
                        });

                        widgets.push({ id, type: node.name, events });
                    }

                    // Recursively process child nodes
                    traverse(node.children);
                }
            });
        };

        traverse(nodes);
        return widgets;
    }

    private extractHandler(handler: AST): string {
        // Use `start` and `end` from `sourceSpan` to extract the corresponding code snippet
        const { start, end } = handler.sourceSpan;
        const normalizedHandler = this.templateSource
            .slice(start, end)
            .replace(/\(\)$/, '') // Remove parentheses for normalization
            .trim();
        // console.log('Normalized handler (TemplateAnalyzer):', normalizedHandler);
        return normalizedHandler;
    }
}