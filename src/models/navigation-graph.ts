export interface Node {
    id: string;
    type: string; // e.g., "route", "widget", etc.
    attributes?: Record<string, any>; // Attributes such as type, class, etc.
    validationRules?: string[]; // Validation rules like required, pattern, etc.
    triggersFormSubmission?: boolean; // Indicates if the widget triggers form submission
}

export interface Transition {
    from: string;
    to: string;
    event: string; // e.g., "click", "submit"
    metadata?: Record<string, any>; // Optional metadata for additional information
}

export interface NavigationGraph {
    nodes: Node[];
    transitions: Transition[];
}