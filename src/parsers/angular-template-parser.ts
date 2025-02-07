import { parseTemplate } from '@angular/compiler';

/**
 * Parses an Angular template string into its Abstract Syntax Tree (AST).
 * This function enables **analysis and processing** of Angular templates.
 *
 * @param template - The Angular template string to parse.
 * @returns The parsed AST nodes of the template.
 */
export async function parseAngularTemplate(template: string) {
    return parseTemplate(template, 'inline').nodes;
}

// Additional parsing utilities can go here