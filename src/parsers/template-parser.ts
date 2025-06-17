// ──────────────────────────────────────────────────────────────────────────────
// template-parser.ts
//
// A TemplateParser module that:
//   1) Defines a common abstract `TemplateParser` interface for parsing templates
//      across different UI frameworks.
//   2) Provides an `AngularTemplateParser` implementation that uses Angular
//      Compiler’s `parseTemplate` to convert an Angular template string into
//      its AST (`TmplAstNode[]`).
//   3) Can be extended in the future for other frameworks (e.g., React, Vue) by
//      implementing the same interface.
// ──────────────────────────────────────────────────────────────────────────────

import { parseTemplate, TmplAstNode } from "@angular/compiler";

/**
 * Defines a common interface for template parsers across different UI frameworks.
 * Implementations of this class should parse a template source string into
 * an array of AST nodes appropriate to the underlying template technology.
 */
export abstract class TemplateParser {
    /**
     * Parses the given template source into its AST nodes.
     *
     * @param template - The raw template source (e.g., HTML/Angular markup).
     * @returns A promise resolving to an array of AST nodes.
     */
    abstract parse(template: string): Promise<TmplAstNode[]>;
}

/**
 * Parses Angular templates by invoking Angular Compiler’s `parseTemplate`.
 * Produces an array of `TmplAstNode` representing the template’s AST.
 */
export class AngularTemplateParser extends TemplateParser {
    /**
     * Parses an Angular template string into its Abstract Syntax Tree (AST).
     *
     * Internally calls `@angular/compiler`’s `parseTemplate(...)` with
     * source set to `'inline'`, then returns the resulting `.nodes`.
     *
     * @param template - The Angular template string to parse.
     * @returns A promise resolving to `TmplAstNode[]` (the template’s AST).
     */
    async parse(template: string): Promise<TmplAstNode[]> {
        // `source` is set to 'inline' so errors/reporting refer to an inline snippet.
        const result = parseTemplate(template, 'inline');
        return result.nodes;
    }
}