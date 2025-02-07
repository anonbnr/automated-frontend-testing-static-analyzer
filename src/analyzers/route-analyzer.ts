import * as ts from 'ts-morph';
import { RouteMap } from '../models/route-info.js';

export class RouteAnalyzer {
    private routeVariableNames: string[];

    constructor(routeVariableNames: string[] = ['routes', 'appRoutes']) {
        this.routeVariableNames = routeVariableNames;
    }

    async analyze(routeFile: ts.SourceFile): Promise<RouteMap> {
        const routeMap: RouteMap = {
            components: [],
            redirections: []
        };

        for (const declaration of routeFile.getVariableDeclarations()) {
            if (this.routeVariableNames.includes(declaration.getName())) {
                const initializer = declaration.getInitializer();
                if (initializer?.isKind(ts.SyntaxKind.ArrayLiteralExpression))
                    await this.processRoutes(initializer.getElements(), routeMap);
            }
        }

        return routeMap;
    }

    private async processRoutes(
        elements: ts.Expression[],
        routeMap: RouteMap,
        parentPath: string = ""
    ): Promise<void> {
        for (const element of elements) {
            if (element.isKind(ts.SyntaxKind.ObjectLiteralExpression)) {
                if (this.hasPathProp(element)) {
                    // Extract 'path' if available
                    const path = this.extractPath(element);
                    const fullPath = parentPath ? `${parentPath}/${path}` : path;
                    if (fullPath) {
                        // Extract 'component' if available
                        const componentName = this.extractComponent(element);
                        if (componentName) {
                            routeMap.components.push({
                                component: componentName,
                                route: fullPath
                            });
                            console.log(`Component ${componentName} mapped to route ${fullPath}`);
                        }
                    }

                    // Extract 'redirectTo' if available
                    const redirectTo = this.extractRedirectTo(element);
                    if (redirectTo) {
                        routeMap.redirections.push({
                            route: fullPath,
                            redirectTo
                        });
                        console.log(`Redirect added: ${fullPath} -> ${redirectTo}`);
                    }

                    // Recursively process child routes
                    const childrenProp = element.getProperty('children');
                    if (childrenProp?.isKind(ts.SyntaxKind.PropertyAssignment)) {
                        const childRoutes = childrenProp.getInitializer()?.asKind(ts.SyntaxKind.ArrayLiteralExpression);
                        if (childRoutes) {
                            await this.processRoutes(childRoutes.getElements(), routeMap, fullPath);
                        }
                    }
                }
            }
        }
    }

    private hasPathProp(element: ts.ObjectLiteralExpression): boolean {
        const pathProp = element.getProperty('path');

        if (pathProp)
            return true;
        else
            return false;
    }

    private extractPath(element: ts.ObjectLiteralExpression): string {
        let routePath = "";
        const pathProp = element.getProperty('path');

        if (pathProp?.isKind(ts.SyntaxKind.PropertyAssignment))
            routePath = pathProp.getInitializer()?.getText().replace(/['"`]/g, "") || "";

        // Check for dynamic segments (e.g., ':id')
        const dynamicSegment = this.extractDynamicSegment(element);
        if (dynamicSegment) {
            routePath = `${routePath}/:${dynamicSegment}`;
        }

        return routePath;
    }

    private extractDynamicSegment(element: ts.ObjectLiteralExpression): string | null {
        const paramsProp = element.getProperty('params'); // Assuming dynamic segments defined here
        if (paramsProp?.isKind(ts.SyntaxKind.PropertyAssignment)) {
            const paramValue = paramsProp.getInitializer()?.getText().replace(/['"`]/g, "");
            return paramValue || null;
        }
        return null;
    }

    private extractComponent(element: ts.ObjectLiteralExpression): string {
        let component = "";
        const componentProp = element.getProperty("component");

        if (componentProp?.isKind(ts.SyntaxKind.PropertyAssignment))
            component = componentProp.getInitializer()?.getText().replace(/['"`]/g, "") || "";

        return component;
    }

    private extractRedirectTo(element: ts.ObjectLiteralExpression): string {
        let redirectTo = "";
        const redirectToProp = element.getProperty("redirectTo");

        if (redirectToProp?.isKind(ts.SyntaxKind.PropertyAssignment))
            redirectTo = redirectToProp.getInitializer()?.getText().replace(/['"`]/g, "") || "";

        return redirectTo;
    }
}