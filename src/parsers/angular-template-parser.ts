import { parseTemplate } from '@angular/compiler';

export async function parseAngularTemplate(template: string) {
    return parseTemplate(template, 'inline').nodes;
}

// Additional parsing utilities can go here