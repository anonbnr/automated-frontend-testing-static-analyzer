import { ComponentInfo } from "../models/component-info.js";
import { RouteMap } from "../models/route-info.js";

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

    static findParentRoutes(
        component: ComponentInfo,
        componentMap: ComponentInfo[],
        routeMap: RouteMap
    ): string[] {
        const parents = this.findParentComponents(component.selector, componentMap);
        const parentRoutes: string[] = [];

        parents.forEach(parentSelector => {
            const route = RouteMapUtils.getRouteFromSelector(parentSelector, routeMap);
            if (route) {
                parentRoutes.push(`/${route}`);
            } else {
                const parentComponent = componentMap.find(c => c.selector === parentSelector);
                if (parentComponent) {
                    const grandParentRoutes = this.findParentRoutes(parentComponent, componentMap, routeMap);
                    parentRoutes.push(...grandParentRoutes);
                }
            }
        });

        return [...new Set(parentRoutes)]; // Remove duplicates
    }

    static findParentComponents(selector: string, componentMap: ComponentInfo[]): string[] {
        return componentMap
            .filter(component => component.nestedComponents.includes(selector))
            .map(component => component.selector);
    }
}