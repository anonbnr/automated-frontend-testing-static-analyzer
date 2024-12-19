import * as path from "path";
import * as ts from 'ts-morph';
import { LogicAnalyzer } from '../analyzers/logic-analyzer.js';
import { RouteAnalyzer } from '../analyzers/route-analyzer.js';
import { TemplateAnalyzer } from '../analyzers/template-analyzer.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { ComponentInfo, ComponentMap } from "../models/component-info.js";
import { NavigationGraph } from '../models/navigation-graph.js';
import { RouteMap, RouteMapUtils } from "../models/route-info.js";

export class StaticAnalyzer {
    private project: ts.Project;
    private projectPath: string;
    private routeAnalyzer: RouteAnalyzer;
    private templateAnalyzer?: TemplateAnalyzer;
    private logicAnalyzer: LogicAnalyzer;
    private graphBuilder: NavigationGraphBuilder;
    private componentMap: ComponentMap = { components: [] };

    constructor(tsConfigPath: string) {
        // Initialize the TypeScript project
        this.project = new ts.Project({
            tsConfigFilePath: tsConfigPath,
        });
        this.projectPath = tsConfigPath.substring(0, tsConfigPath.lastIndexOf(path.sep));
        this.graphBuilder = new NavigationGraphBuilder();
        this.routeAnalyzer = new RouteAnalyzer();
        this.logicAnalyzer = new LogicAnalyzer();
    }

    async analyze(): Promise<NavigationGraph> {
        // Step 1: Build route nodes and transitions and extract route map
        const routeMap = await this.extractRouteMap();
        this.graphBuilder.buildRoutes(routeMap);

        // Step 2: Extract Widgets and Event Handlers
        for (const file of this.project.getSourceFiles()) {
            for (const cls of file.getClasses()) {
                const decorator = cls.getDecorator('Component');
                if (decorator) {
                    this.templateAnalyzer = new TemplateAnalyzer(decorator);
                    const template = this.templateAnalyzer.extractTemplate();

                    if (template) {
                        const componentInfo = await this.templateAnalyzer.analyze(template);
                        const route = this.getComponentRoute(cls, routeMap);

                        // Add component to component map
                        this.componentMap.components.push(componentInfo);

                        // If no route, mark as shared
                        if (!route) {
                            // console.log(`Shared component: ${componentInfo.selector}`);
                            routeMap.sharedComponents = routeMap.sharedComponents || new Set([]);
                            routeMap.sharedComponents.add(componentInfo);
                        }

                        const widgetEventMaps = this.logicAnalyzer.analyze(file, componentInfo.widgets);
                        this.graphBuilder.buildComponentGraph(componentInfo, widgetEventMaps, route);
                    }
                }
            }
        }

        // Display the component map
        // console.log('Component Map:', this.componentMap);

        // Display the route map
        // console.log('Route Map:', routeMap);

        // Build the contains transitions for orphan widgets in shared components
        this.resolveOrphanWidgets(routeMap);

        // Return the built graph
        return this.graphBuilder.getGraph();
    }

    private async extractRouteMap(): Promise<RouteMap> {
        // Step 1: Extract component and redirection routes
        const appModulePath = path.join(this.projectPath, 'src', 'app', 'app.module.ts');
        const routeFile = this.project.getSourceFileOrThrow(appModulePath);
        return await this.routeAnalyzer.analyze(routeFile);
    }

    private getComponentRoute(cls: ts.ClassDeclaration, routeMap: RouteMap) {
        let route = routeMap.components
            .find((componentRoute) => componentRoute.component === cls.getName())
            ?.route;

        if (!route)
            console.log(`Component ${cls.getName()} has no associated route.`);
        else
            route = `/${route}`;

        return route;
    }

    private resolveOrphanWidgets(routeMap: RouteMap): void {
        if (routeMap.sharedComponents) {
            for (const component of routeMap.sharedComponents) {
                // Skip shared components without widgets
                if (component.widgets.length === 0) {
                    console.log(`Skipping shared component ${component.selector} as it has no widgets.`);
                    continue;
                }

                const parents = this.findParentComponents(component.selector);
                // console.log(`Parents of ${component.selector}: `);
                // parents.forEach(parent => console.log(`--${parent}`));

                if (this.isGlobalComponent(parents, routeMap)) {
                    // Handle global components
                    this.graphBuilder.buildGlobalTransitions(component);
                }
                else if (parents.length === 1) {
                    // Case: Nested in a single parent with a route
                    const parentRoute = RouteMapUtils.getRouteFromSelector(parents[0], routeMap);
                    if (parentRoute){
                        console.log(`Found route /${parentRoute} for parent component ${parents[0]} of ${component.selector}`);
                        this.graphBuilder.buildContainsTransitions(`/${parentRoute}`, component.widgets);
                    }
                    else {
                        // If the parent is not mapped to a route, recursively find its parent
                        this.handleNestedParent(component, parents[0], routeMap);
                    }
                } else if (parents.length > 1) {
                    // Case: Nested in multiple parents with routes
                    this.graphBuilder.buildSharedTransitions(component, parents, routeMap);
                } else {
                    // Orphan component
                    console.warn(`Component ${component.selector} could not be categorized.`);
                }
            }
        }
    }

    // Case: Global component
    private isGlobalComponent(parents: string[], routeMap: RouteMap): boolean {
        return parents.includes('app-root')
            || (parents.length > 1 && parents.every(parent => RouteMapUtils.getRouteFromSelector(parent, routeMap)));
    }

    private findParentComponents(selector: string): string[] {
        console.log(`Finding parents for selector: ${selector}`);
        const parents = this.componentMap.components
            .filter((comp) => {
                const isParent = comp.nestedComponents.includes(selector);
                if (isParent) {
                    console.log(`Found parent: ${comp.selector} for ${selector}`);
                }
                return isParent;
            })
            .map((comp) => comp.selector);

        if (parents.length === 0) {
            console.warn(`No parents found for selector: ${selector}`);
        }

        return parents;
    }

    // Handle the case where the parent is not directly mapped to a route
    private handleNestedParent(component: ComponentInfo, parentSelector: string, routeMap: RouteMap): void {
        const parentComponent = this.componentMap.components.find((comp) => comp.selector === parentSelector);
        if (!parentComponent) {
            console.warn(`Parent component ${parentSelector} for ${component.selector} could not be found.`);
            return;
        }

        const grandParentRoute = this.findParentRoute(parentComponent, routeMap);
        if (grandParentRoute){
            console.log(`Found route /${grandParentRoute} for parent component ${parentSelector} of ${component.selector}`);
            this.graphBuilder.buildContainsTransitions(`/${grandParentRoute}`, component.widgets);
        }
        else
            console.warn(`No route could be found for parent component ${parentSelector} of ${component.selector}.`);
    }

    // Recursively find the route of the parent or ancestor component
    private findParentRoute(component: ComponentInfo, routeMap: RouteMap): string | undefined {
        const parents = this.findParentComponents(component.selector);
        if (parents.length === 0)
            return undefined; // No parent, component cannot be connected

        for (const parentSelector of parents) {
            const parentRoute = RouteMapUtils.getRouteFromSelector(parentSelector, routeMap);
            if (parentRoute)
                return parentRoute; // Found a route

            // Recursively search in the parent component's ancestors
            const parentComponent = this.componentMap.components.find((comp) => comp.selector === parentSelector);
            if (parentComponent) {
                const grandParentRoute = this.findParentRoute(parentComponent, routeMap);
                if (grandParentRoute)
                    return grandParentRoute;
            }
        }

        return undefined; // No route found
    }
}