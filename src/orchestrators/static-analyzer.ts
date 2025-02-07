import * as path from "path";
import * as ts from 'ts-morph';
import { LogicAnalyzer } from '../analyzers/logic-analyzer.js';
import { RouteAnalyzer } from '../analyzers/route-analyzer.js';
import { TemplateAnalyzer } from '../analyzers/template-analyzer.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { ComponentMap } from "../models/component-info.js";
import { NavigationGraph } from '../models/navigation-graph.js';
import { RouteMap } from "../models/route-info.js";
import { RouteMapUtils } from "../utils/route-info-utils.js";

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

                        const widgetEventMaps = this.logicAnalyzer.analyze(file, componentInfo.widgets, routeMap);
                        this.graphBuilder.buildComponentGraph(componentInfo, widgetEventMaps, route);
                    }
                }
            }
        }
        // console.log('Component Map:', this.componentMap);
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
        let componentRoute = routeMap.components
            .find((componentRoute) => componentRoute.component === cls.getName());

        if (!componentRoute) {
            console.log(`Component ${cls.getName()} has no associated route.`);
            return undefined;
        }

        const route = `/${componentRoute.route}`;
        console.log(`Component ${cls.getName()} matched with route ${route}`);
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

                const parents = RouteMapUtils.findParentComponents(component.selector, this.componentMap.components);

                if (this.isGlobalComponent(parents, routeMap)) {
                    // Handle global components
                    this.graphBuilder.buildGlobalTransitions(component);
                } else {
                    // Handle shared components
                    this.graphBuilder.buildSharedTransitions(component, routeMap, this.componentMap.components);
                }
            }
        }
    }

    private isGlobalComponent(parents: string[], routeMap: RouteMap): boolean {
        return parents.includes('app-root')
            || (parents.length > 1 && parents.every(parent => RouteMapUtils.getRouteFromSelector(parent, routeMap)));
    }
}