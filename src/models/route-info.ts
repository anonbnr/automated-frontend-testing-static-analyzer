import { ComponentInfo } from "./component-info.js";

/**
 * Represents a route and its associated component.
 */
export interface ComponentRoute {
    /**
     * The path of the route (e.g., "/dashboard").
     */
    route: string;

    /**
     * The name of the component associated with this route.
     */
    component: string;
}

/**
 * Represents a route that redirects to another route.
 */
export interface RedirectRoute {
    /**
     * The original route path.
     */
    route: string;

    /**
     * The path to which this route redirects.
     */
    redirectTo: string;
}

/**
 * Represents the application's route map.
 */
export interface RouteMap {
    /**
     * Routes mapped to their corresponding components.
     */
    components: ComponentRoute[];

    /**
     * Routes that have redirects.
     */
    redirections: RedirectRoute[];

    /**
     * Components shared across multiple routes.
     */
    sharedComponents?: Set<ComponentInfo>;
}