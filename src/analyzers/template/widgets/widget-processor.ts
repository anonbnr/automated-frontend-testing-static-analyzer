import { AST, TmplAstElement, TmplAstNode } from "@angular/compiler";
import { WidgetInfo } from "../../../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";

/**
 * Processes an Angular template to extract **interactive widgets**.
 */
export class WidgetProcessor {
    private idGenerator: WidgetIDGenerator;
    private templateSource: string; // Full source code of the template
    private targetTags: Set<string>;

    /**
     * Creates an instance of `WidgetProcessor`.
     *
     * @param templateSource - The raw HTML content of the template.
     * @param targetTags - The set of target widget tags to process.
     * @param idGenerator - An instance of `WidgetIDGenerator` for assigning unique IDs.
     */
    constructor(
        templateSource: string,
        targetTags: Set<string> = new Set([
            'button', 'input', 'a', 'form', 'select', 'option', 'textarea',
            'mat-select', 'mat-option', 'mat-checkbox', 'mat-radio-group', 'mat-radio-button', 'mat-button-toggle-group', 'mat-button-toggle'
        ]),
        idGenerator: WidgetIDGenerator = new WidgetIDGenerator()) {
        this.templateSource = templateSource;
        this.targetTags = targetTags;
        this.idGenerator = idGenerator;
    }

    /**
     * Extracts and processes **interactive widgets** from the template AST.
     *
     * @param nodes - The AST nodes of the Angular template.
     * @returns A list of **extracted widgets**.
     */
    processWidgets(nodes: TmplAstNode[]): WidgetInfo[] {
        const widgets: WidgetInfo[] = [];

        const traverse = (nodes: TmplAstNode[]) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log(`Processing node: ${node.name}`);
                    // Process only targeted widgets
                    if (this.targetTags.has(node.name.toLowerCase())) { //! if this node is a button, input etc
                        // console.log(`Detected widget: ${node.name}`);
                        const id = node.attributes.find((attr) => attr.name === 'id')?.value
                            || this.idGenerator.generateID(node); //! We either take the original Id or we generate one
                        const events = new Map<string, string>();
                        const attributes: any = {};

                        // Extract routerLink for elements
                        const routerLinkAttr =
                            node.attributes.find(attr => attr.name === 'routerLink')
                            || node.inputs.find(attr => attr.name === "routerLink" || attr.name === "[routerLink]");
                        if (routerLinkAttr) {
                            let extractedValue = routerLinkAttr.value.toString().trim();

                            // Match value inside single quotes and extract
                            const match = extractedValue.match(/'([^']+)'/);
                            if (match) {
                                extractedValue = match[1];
                            }

                            // Remove extra spaces and inline metadata
                            extractedValue = extractedValue.split(" in inline@")[0].trim();

                            // Store cleaned routerLink
                            events.set('routerLink', extractedValue);
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
                        // console.log("##################################");
                        // console.log(node.name);
                        // console.log("##################################");

                        if (node.name === 'mat-select') {
                            //TODO: extract values of option tags
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
                            // let values = []
                            // let i = 0
                            // while (i < node.children.length) {
                            //     let option = node.children[i++];
                            //     console.log("##################################");
                            //     console.log(option);
                            //     console.log("%%%%%%%%%%%%%%%%%%%%%%%%")
                            // }

                            // traverse(node.children);
                            // console.log(values)
                        }



                        // Check for validation attributes
                        const validationRules: string[] = [];
                        if (attributes.required) validationRules.push('required');
                        if (attributes.pattern) validationRules.push('pattern');
                        if (attributes.min) validationRules.push('min');
                        if (attributes.max) validationRules.push('max');

                        // Check for form submission triggers

                        // TODO: Verify triggersFormSubmission = (node.name === 'input' || node.name === 'button') && attributes.type === 'submit'
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

    /**
     * Extracts the handler name from an Angular event binding.
     *
     * @param handler - The AST representation of the event handler.
     * @returns The **normalized handler name**.
     */
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