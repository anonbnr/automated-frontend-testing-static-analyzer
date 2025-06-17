// ──────────────────────────────────────────────────────────────────────────────
// route-utils.ts
//
// Utility class providing helper methods for **route-related** operations in an
// Angular application. Includes methods to:
//   1) Convert Angular component selectors (kebab-case) to their corresponding
//      PascalCase component class names.
//   2) Retrieve the route path associated with a given component selector.
//   3) Find parent route paths for a component by traversing the component
//      hierarchy.
//   4) Identify parent components that include a given component in their nested
//      components list.
//
// These utilities operate on a `RouteMap` (as produced by `RouteAnalyzer`) and a
// collection of `ComponentInfo` entries (as produced by a component registry).
// ──────────────────────────────────────────────────────────────────────────────

import { Expression, ObjectLiteralExpression, PropertyAssignment, SyntaxKind } from "ts-morph";
import { ComponentInfo } from "../../models/component-info.js";
import { RouteMap } from "../../models/route-info.js";

/**
 * Utility class for handling **route-related** operations in an Angular
 * application. These methods assist in mapping between component selectors
 * and route paths, as well as traversing component hierarchies to identify
 * parent routes.
 */
export class RoutingUtils {
    /**
     * Retrieves the **route path** associated with a given component selector.
     *
     * Performs the following steps:
     *  1. Converts the kebab-case selector (e.g., `'app-dashboard'`) into the
     *     corresponding PascalCase component class name (e.g., `'DashboardComponent'`).
     *  2. Searches the provided `routeMap.routes` array for a `ComponentRoute`
     *     entry whose `component` property matches the converted class name.
     *
     * **Example:**
     * ```ts
     * const routeMap: RouteMap = { ... };
     * const selector = 'app-dashboard';
     * const path = RoutingUtils.getRouteFromSelector(selector, routeMap);
     * // If DashboardComponent is registered at the '/dashboard' path,
     * // then `path` will be '/dashboard'.
     * ```
     *
     * @param selector - The Angular component selector (kebab-case), e.g. `'app-header'`.
     * @param routeMap  - The `RouteMap` object containing all defined routes.
     * @returns The **route path** associated with the converted component class name,
     *          or `undefined` if no matching route is found.
     */
    static getRouteFromSelector(selector: string, routeMap: RouteMap): string | undefined {
        // Convert kebab-case selector to PascalCase component class name
        const className = this.convertSelectorToClassName(selector);

        // Find the first route entry whose `component` matches the className
        return routeMap.routes.find((cmpRoute) => cmpRoute.component === className)?.route;
    }

    /**
     * Returns *all* route paths associated with a given component selector.
     */
    static getRoutesFromSelector(
        selector: string,
        routeMap: RouteMap
    ): string[] {
        const className = this.convertSelectorToClassName(selector);
        return routeMap.routes
            .filter(r => r.component === className)
            .map(r => r.route);
    }

    /**
     * Converts a **kebab-case Angular component selector** into a **PascalCase
     * component class name**.
     *
     * Steps:
     *  1. Split the selector on hyphens.
     *  2. Capitalize the first letter of each segment.
     *  3. Discard the first segment (typically the app prefix, e.g., `'app'`).
     *  4. Append `'Component'` to the end of the concatenated PascalCase string.
     *
     * **Example:**
     * ```ts
     * const selector = 'app-dashboard';
     * const className = RoutingUtils.convertSelectorToClassName(selector);
     * // className === 'DashboardComponent'
     * ```
     *
     * @param selector - The kebab-case selector (e.g., `'app-user-list'`).
     * @returns The PascalCase component class name with `'Component'` suffix
     *          (e.g., `'UserListComponent'`).
     */
    static convertSelectorToClassName(selector: string): string {
        return selector
            .split("-")                                     // ["app", "dashboard"]
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1)) // ["App", "Dashboard"]
            .slice(1)                                       // ["Dashboard"]
            .concat("Component")                            // ["Dashboard", "Component"]
            .join("");                                      // "DashboardComponent"
    }

    /**
     * Finds the **parent route paths** of a given component by analyzing the
     * component hierarchy. A parent route is any route whose associated
     * component directly or indirectly contains the specified component in its
     * nested component list.
     *
     * Process:
     *  1. Use `findParentComponents` to retrieve the selectors of immediate
     *     parent components (those whose `nestedComponents` array contains
     *     the given component's selector).
     *  2. For each parent selector, attempt to resolve its route path via `getRouteFromSelector`.
     *      - If found, prefix it with `'/'` and add to the result set.
     *      - If not found, recursively call `findParentRoutes` on the
     *          parent component to discover higher-level ancestors.
     *  3. Deduplicate the final list of parent route paths.
     *
     * **Example:**
     * ```ts
     * const childComponent: ComponentInfo = {
     *   selector: 'app-post-item',
     *   nestedComponents: []
     * };
     * const allComponents: ComponentInfo[] = [ ... ];
     * const routeMap: RouteMap = { ... };
     *
     * const parents = RoutingUtils.findParentRoutes(childComponent, allComponents, routeMap);
     * // Might return ['/posts', '/blog'] if PostItem is nested under PostListComponent
     * // which itself is under BlogComponent, etc.
     * ```
     *
     * @param component     - The `ComponentInfo` of the component whose parent
     *                        routes should be found.
     * @param componentMap  - Array of all `ComponentInfo` entries in the project.
     * @param routeMap      - The `RouteMap` containing all defined routes.
     * @returns An array of unique **parent route paths** (each prefixed with `"/"`).
     */
    static findParentRoutes(
        component: ComponentInfo,
        componentMap: ComponentInfo[],
        routeMap: RouteMap
    ): string[] {
        // Find the selectors of components that declare `component.selector` in their nestedComponents
        const parents = this.findParentComponents(component.selector, componentMap);
        const parentRoutes: string[] = [];

        for (const parentSelector of parents) {
            // Attempt to retrieve the route path for the parent component
            const route = RoutingUtils.getRouteFromSelector(parentSelector, routeMap);

            if (route) {
                // If a direct route is found, prefix with '/'
                parentRoutes.push(`/${route}`);
            }
            else {
                // Otherwise, attempt to recursively find higher-level parent routes
                const parentComponent = componentMap.find((c) => c.selector === parentSelector);
                if (parentComponent) {
                    const ancestorRoutes = this.findParentRoutes(parentComponent, componentMap, routeMap);
                    parentRoutes.push(...ancestorRoutes);
                }
            }
        }

        // Deduplicate by converting to a Set, then back to an array
        return [...new Set(parentRoutes)];
    }

    /**
     * Finds **parent components** whose `nestedComponents` array includes the
     * specified component selector.
     *
     * @param selector     - The selector of the component to search for (e.g., `'app-post-list'`).
     * @param componentMap - Array of all `ComponentInfo` entries in the project.
     * @returns A list of **parent component selectors** that directly nest the specified component.
     */
    static findParentComponents(selector: string, componentMap: ComponentInfo[]): string[] {
        return componentMap
            .filter(component => component.nestedComponents.includes(selector))
            .map(component => component.selector);
    }

    /**
     * Returns true if `obj` has a PropertyAssignment named `key`.
     * @param element - The object literal representing to examine.
     * @returns true if `obj` has a property assignment named `key`, false otherwise.
     */
    static hasProp(obj: ObjectLiteralExpression, key: string): boolean {
        return obj.getProperty(key) !== undefined;
    }

    /**
   * Returns the string‐value of `key: 'someText'` or `key: SomeIdentifier` or
   * `key: () => import('...').then(m => m.X)`, etc. (the raw `getText()` with quotes stripped).
   * If the property doesn't exist or not a PropertyAssignment, returns undefined.
   */
    static getPropAsText(obj: ObjectLiteralExpression, key: string): string | undefined {
        const prop = obj.getProperty(key);
        if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment))
            return undefined;

        const init = (prop as PropertyAssignment).getInitializer();

        if (!init)
            return undefined;

        // strip surrounding quotes if present
        return init.getText().replace(/^['"`](.*)['"`]$/s, "$1");
    }

    /**
     * Returns an array of strings if the property is `key: [ A, B, C ]` (array literal).
     * Strips quotes from each element. If the property missing or not array‐literal, returns [].
     */
    static getPropAsStringArray(obj: ObjectLiteralExpression, key: string): string[] {
        const prop = obj.getProperty(key);
        if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return [];
        const init = (prop as PropertyAssignment).getInitializer();
        if (!init || !init.isKind(SyntaxKind.ArrayLiteralExpression)) return [];
        return init
            .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
            .getElements()
            .map((el) => el.getText().replace(/^['"`](.*)['"`]$/s, "$1"));
    }

    /**
     * Returns a plain object if the property is `key: { a: 'X', b: Y }` (object literal).
     * Each value is returned as its text with quotes stripped. If missing or not object‐literal, returns {}.
     */
    static getPropAsObjectLiteral(obj: ObjectLiteralExpression, key: string): { [p: string]: string } {
        const prop = obj.getProperty(key);
        if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return {};
        const init = (prop as PropertyAssignment).getInitializer();
        if (!init || !init.isKind(SyntaxKind.ObjectLiteralExpression)) return {};

        const result: { [p: string]: string } = {};
        const lit = init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        for (const p of lit.getProperties()) {
            if (!p.isKind(SyntaxKind.PropertyAssignment)) continue;
            const pa = p as PropertyAssignment;
            const name = pa.getName();
            const valueNode = pa.getInitializer();
            if (!valueNode) continue;
            result[name] = valueNode.getText().replace(/^['"`](.*)['"`]$/s, "$1");
        }
        return result;
    }

    /**
     * Helper to return the raw Initializer for a property (may be used to inspect complex structures).
     * Returns undefined if no such property or not a PropertyAssignment.
     */
    static getPropInitializer(obj: ObjectLiteralExpression, key: string): Expression | undefined {
        const prop = obj.getProperty(key);
        if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return undefined;
        return (prop as PropertyAssignment).getInitializer() || undefined;
    }
}