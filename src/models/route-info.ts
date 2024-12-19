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

export class RouteMapUtils {
    static getRouteFromSelector(selector: string, routeMap: RouteMap): string | undefined {
        // Convert kebab-case selector to PascalCase component class name
        const className = this.convertSelectorToClassName(selector);

        // console.log(`Component ${className} with selector ${selector}`); // Debug log

        // Find the route based on the transformed class name
        return routeMap.components.find((comp) => comp.component === className)?.route;
    }

    private static convertSelectorToClassName(selector: string): string {
        // Split the selector by hyphens and capitalize each part
        return selector
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .slice(1)
            .concat('Component')
            .join('');
    }
}