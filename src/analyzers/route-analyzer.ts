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

                if (initializer?.isKind(ts.SyntaxKind.ArrayLiteralExpression)) {
                    for (const element of initializer.getElements()) {
                        if (element.isKind(ts.SyntaxKind.ObjectLiteralExpression)) {
                            if (this.hasPathProp(element)) {
                                // Extract 'path' if available
                                const routePath = this.extractPath(element);

                                if (routePath) {
                                    // Extract 'component' if available
                                    const componentName = this.extractComponent(element);
                                    if (componentName) {
                                        routeMap.components.push({
                                            component: componentName,
                                            route: routePath
                                        });
                                        console.log(`Component ${componentName} mapped to route ${routePath}`); // Debug log
                                    }
                                }

                                // Extract 'redirectTo' if available
                                const redirectTo = this.extractRedirectTo(element);
                                if (redirectTo) {
                                    // await this.graphBuilder.addRouteRedirect(routeId, `/${redirectTo}`);
                                    routeMap.redirections.push({
                                        route: routePath,
                                        redirectTo
                                    });
                                    console.log(`Redirect added: ${routePath} -> ${redirectTo}`); // Debug log
                                }
                            }
                        }
                    }
                }
            }
        }

        return routeMap;
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

        return routePath;
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