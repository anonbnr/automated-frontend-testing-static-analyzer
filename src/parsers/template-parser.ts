// ──────────────────────────────────────────────────────────────────────────────
// parsers/template-parser.ts
//
// Purpose
//   Provide a unified abstraction for parsing UI component templates into
//   analyzable AST nodes, with a concrete Angular implementation.
//
// Design
//   - TemplateParser          : abstract interface / contract
//   - AngularTemplateParser   : Angular-specific implementation using
//                               @angular/compiler's `parseTemplate()`
//
// Notes
//   • Returns Angular's `TmplAstNode[]` structure used throughout analyzers.
//   • Can be extended for other frameworks (React, Vue, Svelte, etc.)
//     by subclassing TemplateParser and overriding `parse()`.
//   • Uses `"inline"` source id for Angular parsing so diagnostics remain
//     meaningful even for inline templates.
// ──────────────────────────────────────────────────────────────────────────────

import { parseTemplate, TmplAstNode } from "@angular/compiler";

/**
 * Abstract interface for parsing UI component templates into AST nodes.
 *
 * Implementations must take a raw template string (HTML/markup)
 * and return a Promise resolving to an array of framework-specific
 * AST nodes suitable for downstream analysis.
 */
export abstract class TemplateParser {
    /**
    * Parse the given template source into its AST representation.
    *
    * @param template Raw template text (e.g., HTML or Angular markup).
    * @returns Promise resolving to an array of parsed AST nodes.
    */
    abstract parse(template: string): Promise<TmplAstNode[]>;
}

/**
 * Angular-specific implementation of {@link TemplateParser}.
 *
 * Internally delegates to `@angular/compiler`'s `parseTemplate()` to produce
 * Angular's canonical `TmplAstNode[]` representation.
 */
export class AngularTemplateParser extends TemplateParser {
    /**
    * Parse an Angular template string into its AST nodes.
    *
    * @param template Angular template source (inline or file-loaded).
    * @returns Promise resolving to Angular compiler `TmplAstNode[]` nodes.
    */
    async parse(template: string): Promise<TmplAstNode[]> {
        // Use 'inline' as source name so compiler errors can map to inline snippets.
        const result = parseTemplate(template, 'inline');

        // Angular's parseTemplate returns { nodes, errors, styleUrls, etc. }.
        // Only the AST `nodes` array is relevant for static analysis.
        return result.nodes;
    }
}