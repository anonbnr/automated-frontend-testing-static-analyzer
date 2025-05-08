import { TmplAstNode } from "@angular/compiler";

export type WidgetInfo = {
    id: string;
    type: string;
    events: Map<string, string>;
    attributes?: {
        [key: string]: any;
    };
    validationRules?: string[];
    triggersFormSubmission?: boolean;
    children?: WidgetInfo[];
    originalNode: TmplAstNode,
}
