import { ComponentInfo } from "./component-info.js";

export interface ComponentRoute {
    route: string;
    component: string;
}

export interface RedirectRoute {
    route: string;
    redirectTo: string;
}

export interface RouteMap {
    components: ComponentRoute[]; // Routes and associated components
    redirections: RedirectRoute[]; // Route redirections
    sharedComponents?: Set<ComponentInfo>; // Components shared across multiple routes
}