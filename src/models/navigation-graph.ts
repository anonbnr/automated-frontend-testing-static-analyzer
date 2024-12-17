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

export interface ComponentRoute {
    route: string;
    component: string;
}

export interface RedirectRoute {
    route: string;
    redirectTo: string;
}

export interface RouteMap {
    components: ComponentRoute[];
    redirections: RedirectRoute[];
}