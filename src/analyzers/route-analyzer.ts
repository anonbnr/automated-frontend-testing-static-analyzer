import * as ts from 'ts-morph';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';

export class RouteAnalyzer {
    private graphBuilder: NavigationGraphBuilder;
    private routeVariableNames: string[];

    constructor(graphBuilder: NavigationGraphBuilder, routeVariableNames: string[] = ['routes', 'appRoutes']) {
        this.graphBuilder = graphBuilder;
        this.routeVariableNames = routeVariableNames;
    }

    async analyze(routeFile: ts.SourceFile): Promise<Map<string, string>> {
        const routeMap = new Map<string, string>();

        for (const declaration of routeFile.getVariableDeclarations()) {
            if (this.routeVariableNames.includes(declaration.getName())) {
                const initializer = declaration.getInitializer();

                if (initializer?.isKind(ts.SyntaxKind.ArrayLiteralExpression)) {
                    for (const element of initializer.getElements()) {
                        if (element.isKind(ts.SyntaxKind.ObjectLiteralExpression)) {
                            // Extract 'path' if available
                            const routePath = this.extractPath(element);
                            const routeId = `/${routePath}`;

                            if (routePath) {
                                await this.graphBuilder.addRoute(routeId);
                                console.log(`Route extracted: ${routeId}`); // Debug log

                                // Extract 'component' if available
                                const componentName = this.extractComponent(element);
                                if (componentName) {
                                    routeMap.set(componentName, routeId);
                                    console.log(`Component ${componentName} mapped to route ${routeId}`); // Debug log
                                }
                            }

                            // Extract 'redirectTo' if available
                            const redirectTo = this.extractRedirectTo(element);
                            if (redirectTo) {
                                await this.graphBuilder.addRouteRedirect(routeId, `/${redirectTo}`);
                                console.log(`Redirect added: ${routeId} -> /${redirectTo}`); // Debug log
                            }
                        }
                    }
                }
            }
        }

        return routeMap;
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