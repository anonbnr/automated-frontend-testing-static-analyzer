// ──────────────────────────────────────────────────────────────────────────────
// parsers/template-parser.ts
//
// Defines a framework-agnostic template parser interface and
// provides an Angular-specific implementation.
//   - TemplateParser         : abstract contract for converting a template
//                              string into AST nodes.
//   - AngularTemplateParser  : uses Angular Compiler’s `parseTemplate`
//                              to produce `TmplAstNode[]`.
//   - Extensible for future frameworks (React, Vue, etc.).
// ──────────────────────────────────────────────────────────────────────────────

import { parseTemplate, TmplAstNode } from "@angular/compiler";

/**
 * Abstract interface for parsing UI component templates into AST nodes.
 *
 * Implementations must take a raw template string (HTML/markup)
 * and return a promise resolving to an array of framework-specific
 * AST nodes for downstream analysis.
 */
export abstract class TemplateParser {
    /**
     * Parse the given template source into its AST representation.
     *
     * @param template - Raw template text (e.g. HTML, Angular markup).
     * @returns A promise resolving to an array of AST nodes.
     */
    abstract parse(template: string): Promise<TmplAstNode[]>;
}

/**
 * Angular implementation of `TemplateParser`.
 *
 * Internally invokes `@angular/compiler`’s `parseTemplate`
 * with source `'inline'` to produce a `TmplAstNode[]` AST.
 */
export class AngularTemplateParser extends TemplateParser {
    /**
     * Parses an Angular template string into its AST nodes.
     *
     * @param template - The Angular template (inline or file-loaded).
     * @returns Promise resolving to `TmplAstNode[]` for that template.
     */
    async parse(template: string): Promise<TmplAstNode[]> {
        // Use 'inline' so any compiler errors map back to a snippet
        const result = parseTemplate(template, 'inline');
        return result.nodes;
    }
}