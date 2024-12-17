export interface Node {
    id: string;
    type: string; // e.g., "route", "widget", etc.
}

export interface Transition {
    from: string;
    to: string;
    event: string; // e.g., "click", "submit"
}

export interface NavigationGraph {
    nodes: Node[];
    transitions: Transition[];
}