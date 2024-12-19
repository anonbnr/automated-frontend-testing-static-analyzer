import { AST, TmplAstElement, TmplAstNode } from "@angular/compiler";
import { WidgetInfo } from "../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";

export class WidgetProcessor {
    private idGenerator: WidgetIDGenerator;
    private templateSource: string; // Full source code of the template
    private targetTags: Set<string>;

    constructor(
        templateSource: string,
        targetTags: Set<string> = new Set(['button', 'input', 'a', 'form', 'select', 'textarea']),
        idGenerator: WidgetIDGenerator = new WidgetIDGenerator()) {
        this.templateSource = templateSource;
        this.targetTags = targetTags;
        this.idGenerator = idGenerator;
    }

    processWidgets(nodes: TmplAstNode[]): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];

        const traverse = (nodes: TmplAstNode[]) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log(`Processing node: ${node.name}`);
                    // Process only targeted widgets
                    if (this.targetTags.has(node.name.toLowerCase())) {
                        // console.log(`Detected widget: ${node.name}`);
                        const id = node.attributes.find((attr) => attr.name === 'id')?.value
                            || this.idGenerator.generateID(node);
                        const events = new Map<string, string>();
                        const attributes: any = {};

                        // Extract routerLink for anchors
                        if (node.name.toLowerCase() === 'a') {
                            const anchorAttr = node.attributes.find(attr => attr.name === 'routerLink');
                            if (anchorAttr)
                                events.set(anchorAttr.name, anchorAttr.value);
                        }

                        // Extract events
                        node.outputs.forEach(output => {
                            const handler = this.extractHandler(output.handler);
                            events.set(output.name, handler);
                        });

                        // Extract attributes
                        node.attributes.forEach(attr => {
                            attributes[attr.name] = attr.value;
                        });

                        // Add type-specific attributes
                        if (node.name === 'input') {
                            attributes.type = attributes.type || 'text';
                        }

                        // Check for validation attributes
                        const validationRules: string[] = [];
                        if (attributes.required) validationRules.push('required');
                        if (attributes.pattern) validationRules.push('pattern');
                        if (attributes.min) validationRules.push('min');
                        if (attributes.max) validationRules.push('max');

                        // Check for form submission triggers
                        const triggersFormSubmission = node.name === 'button' && attributes.type === 'submit';

                        widgets.push({
                            id,
                            type: node.name,
                            events,
                            attributes,
                            validationRules,
                            triggersFormSubmission
                        });
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