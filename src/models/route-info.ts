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