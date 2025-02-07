import { ComponentInfo } from "../../models/component-info.js";
import { RouteMap } from "../../models/route-info.js";

/**
 * Utility class for handling **route-related** operations.
 */
export class RouteMapUtils {
    /**
     * Retrieves the **route path** associated with a given component selector.
     * 
     * **Example:**
     * - If the selector is `'app-dashboard'`, it converts it to `'DashboardComponent'`
     *   and searches for its corresponding route.
     *
     * @param selector - The selector of the component (e.g., `'app-header'`).
     * @param routeMap - The route map containing all defined routes.
     * @returns The **route path** associated with the component, or `undefined` if not found.
     */
    static getRouteFromSelector(selector: string, routeMap: RouteMap): string | undefined {
        // Convert kebab-case selector to PascalCase component class name
        const className = this.convertSelectorToClassName(selector);

        // console.log(`Component ${className} with selector ${selector}`); // Debug log

        // Find the route based on the transformed class name
        return routeMap.components.find((comp) => comp.component === className)?.route;
    }

    /**
     * Converts a **kebab-case Angular component selector** into a **PascalCase component class name**.
     *
     * **Example:**
     * - `'app-dashboard'` → `'DashboardComponent'`
     *
     * @param selector - The Angular component selector.
     * @returns The PascalCase component class name.
     */
    private static convertSelectorToClassName(selector: string): string {
        // Split the selector by hyphens and capitalize each part
        return selector
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .slice(1)
            .concat('Component')
            .join('');
    }

    /**
     * Finds the **parent route(s)** of a given component by analyzing the component hierarchy.
     * 
     * **Example:**
     * - If `ChildComponent` is used inside `ParentComponent`, this method finds the route of `ParentComponent`.
     *
     * @param component - The component whose parent routes are to be found.
     * @param componentMap - List of all components in the project.
     * @param routeMap - The map of application routes.
     * @returns A list of **parent route paths**.
     */
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

    /**
     * Finds **parent components** that contain the given component in their **nested components list**.
     *
     * @param selector - The selector of the component (e.g., `'app-post-list'`).
     * @param componentMap - List of all components in the project.
     * @returns A list of **parent component selectors**.
     */
    static findParentComponents(selector: string, componentMap: ComponentInfo[]): string[] {
        return componentMap
            .filter(component => component.nestedComponents.includes(selector))
            .map(component => component.selector);
    }
}