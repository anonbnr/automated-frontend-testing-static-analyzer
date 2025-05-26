import { AST, TmplAstElement, TmplAstNode } from "@angular/compiler";
import { WidgetInfo } from "../../../models/widget-info.js";
import { WidgetIDGenerator } from "./widget-id-generator.js";
import { waitForDebugger } from "inspector";

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
            'button', 'input',

            // 'a', 'form',

            'select', 'option', 'textarea',
            'mat-select'
            // , 'mat-option'
            , 'mat-checkbox',
            'mat-radio-group',
            // 'mat-radio-button',
            'mat-button-toggle-group',
            // 'mat-button-toggle'
        ]),
        idGenerator: WidgetIDGenerator = new WidgetIDGenerator()) {
        this.templateSource = templateSource;
        this.targetTags = targetTags;
        this.idGenerator = idGenerator;
    }


    processWidgets(nodes: TmplAstNode[]): WidgetInfo[] {

        const traverse = (
            nodes: TmplAstNode[],
            targetedTags: Set<string>
        ) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log(`Processing node: ${node.name}`);
                    // Process only targeted widgets
                    if (targetedTags.has(node.name.toLowerCase())) {
                        // console.log(`Detected widget: ${node.name}`);
                        const id = node.attributes.find((attr) => attr.name === 'id')?.value
                            || this.idGenerator.generateID(node);
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
                        // if (node.name === 'input') {
                        //     attributes.type = attributes.type || 'text';
                        // }

                        // Check for validation attributes
                        const validationRules: string[] = [];
                        if (attributes.required !== undefined) validationRules.push('required');
                        if (attributes.pattern) validationRules.push('pattern');
                        if (attributes.min) validationRules.push('min');
                        if (attributes.max) validationRules.push('max');
                        if (attributes.minlength) validationRules.push('minLength');
                        if (attributes.maxlength) validationRules.push('maxLength');

                        // Check for form submission triggers
                        const triggersFormSubmission = node.name === 'button' && attributes.type === 'submit';

                        widgets.push({
                            id,
                            type: node.name,
                            events,
                            attributes,
                            validationRules,
                            triggersFormSubmission,
                            children: [],
                            originalNode: node
                        });
                    }
                    traverse(node.children, targetedTags);

                    // Recursively process child nodes
                }
            });
        };

        const scan_4 = (nodes: TmplAstNode[], targetedTags: Set<string>, nonTargetedTags: Set<string>) => {
            nodes.forEach((node) => {
                if (node instanceof TmplAstElement) {
                    // console.log(`Processing node: ${node.name}`);
                    // Process only targeted widgets
                    if (targetedTags.has(node.name.toLowerCase())) {
                        // console.log(`Detected widget: ${node.name}`);
                        const id = node.attributes.find((attr) => attr.name === 'id')?.value
                            || this.idGenerator.generateID(node);


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

                        // Check for validation attributes
                        const validationRules: string[] = [];
                        if (attributes.required) validationRules.push('required');
                        if (attributes.pattern) validationRules.push('pattern');
                        if (attributes.min) validationRules.push('min');
                        if (attributes.max) validationRules.push('max');

                        // Check for form submission triggers
                        const triggersFormSubmission = node.name === 'button' && attributes.type === 'submit';

                        firstLevelWidgets.push({
                            id,
                            type: node.name,
                            events,
                            attributes,
                            validationRules,
                            triggersFormSubmission,
                            children: [],
                            originalNode: node,
                        });

                    }
                    if (!nonTargetedTags.has(node.name.toLowerCase())) {
                        // Recursively process child nodes that not already traversed
                        scan_4(node.children, targetedTags, nonTargetedTags);
                    }
                }
            });
        };

        let firstLevelTags: Set<string> = new Set(['a', 'form']);
        let widgets: WidgetInfo[] = [];
        traverse(nodes, firstLevelTags);
        //! OUTPUT: List of Widget Info {form, a} 
        //! stored in the temprary list widgets


        let secondLevelTags: Set<string> = new Set([
            'button', 'input', 'select', 'option', 'textarea',
            'mat-select', 'mat-checkbox',
            'mat-radio-group', 'mat-button-toggle-group'
        ]);

        let firstLevelWidgets: WidgetInfo[] = [...widgets];

        widgets = []

        for (let wdgt of firstLevelWidgets) {
            traverse([wdgt.originalNode], secondLevelTags);
            wdgt.children = [...widgets];
            widgets = []
        }

        let thirdLevelTags: Set<string> = new Set([
            'mat-radio-button', 'mat-option', 'mat-button-toggle'
        ]);

        widgets = []
        for (let wdgt of firstLevelWidgets) {
            let secondLevelWdgts = wdgt.children;
            if (secondLevelWdgts) {
                for (let wdgt2 of secondLevelWdgts) {
                    traverse([wdgt2.originalNode], thirdLevelTags);
                    wdgt2.children = [...widgets];
                    widgets = []
                }
            }
        }

        scan_4(nodes, secondLevelTags, firstLevelTags);

        return firstLevelWidgets;
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