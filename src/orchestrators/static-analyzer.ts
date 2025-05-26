import * as path from "path";
import * as ts from 'ts-morph';
import { LogicAnalyzer } from '../analyzers/logic-analyzer.js';
import { RouteAnalyzer } from "../analyzers/routes/route-analyzer.js";
import { RouteMapUtils } from "../analyzers/routes/route-info-utils.js";
import { TemplateAnalyzer } from "../analyzers/template/template-analyzer.js";
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { ComponentMap } from "../models/component-info.js";
import { NavigationGraph } from '../models/navigation-graph.js';
import { RouteMap } from "../models/route-info.js";
import { WidgetInfo } from "../models/widget-info.js";
/**
 * The `StaticAnalyzer` is responsible for analyzing an Angular application to generate a
 * navigation graph that includes component structure, routing information, and widget interactions.
 */
export class StaticAnalyzer {
    private project: ts.Project;
    private projectPath: string;
    private routeAnalyzer: RouteAnalyzer;
    private templateAnalyzer?: TemplateAnalyzer;
    private logicAnalyzer: LogicAnalyzer;
    private graphBuilder: NavigationGraphBuilder;
    private componentMap: ComponentMap = { components: [] };

    /**
     * Initializes the `StaticAnalyzer` with the specified TypeScript configuration file.
     * @param tsConfigPath Path to the `tsconfig.json` file of the Angular project.
     */
    constructor(tsConfigPath: string) {
        // Initialize the TypeScript project
        this.project = new ts.Project({
            tsConfigFilePath: tsConfigPath,
        });
        this.projectPath = tsConfigPath.substring(0, tsConfigPath.lastIndexOf(path.sep));
        this.graphBuilder = new NavigationGraphBuilder();

        //FIXME: Why not initiallizing The templateAnalyzer
        this.routeAnalyzer = new RouteAnalyzer();
        this.logicAnalyzer = new LogicAnalyzer();
    }

    /**
     * Analyzes the Angular project to generate a navigation graph.
     * @returns A promise resolving to the generated `NavigationGraph`.
     */
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

                        // Extract and analyze widget interactions                                                
                        const allWidgets = this.collectAllWidgets(componentInfo.widgets);
                        const widgetEventMaps = this.logicAnalyzer.analyze(file, allWidgets, routeMap);

                        // Build navigation graph for this component
                        // FIXME: Why building the graph by component and not once using the ComponentMap
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
    /**
     * Collecte récursivement tous les widgets (parents et enfants)
     */
    private collectAllWidgets(widgets: WidgetInfo[]): WidgetInfo[] {
    const allWidgets: WidgetInfo[] = [];
    
    function collectRecursive(widgetList: WidgetInfo[]) {
        for (const widget of widgetList) {
        allWidgets.push(widget);
        if (widget.children && widget.children.length > 0) {
            collectRecursive(widget.children);
        }
        }
    }
    
    collectRecursive(widgets);
    return allWidgets;
    }

    /**
     * Extracts the routing information from the Angular project.
     * @returns A promise resolving to a `RouteMap` containing component routes and redirections.
     */
    private async extractRouteMap(): Promise<RouteMap> {
        // Step 1: Extract component and redirection routes
        const appModulePath = path.join(this.projectPath, 'src', 'app', 'app.module.ts');
        const routeFile = this.project.getSourceFileOrThrow(appModulePath);
        return await this.routeAnalyzer.analyze(routeFile);
    }

    /**
     * Finds the route associated with a given component class.
     * @param cls The TypeScript class declaration of a component.
     * @param routeMap The `RouteMap` containing component routes.
     * @returns The component's route as a string, or `undefined` if no route is found.
     */
    private getComponentRoute(cls: ts.ClassDeclaration, routeMap: RouteMap) {
        // FIXME: Do we compare with the selector value or the class name
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

    /**
     * Resolves orphan widgets in shared components by linking them to appropriate parent routes or components.
     * @param routeMap The `RouteMap` containing component and shared component information.
     */
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

    /**
     * Determines whether a component is a global component.
     * A component is considered global if:
     * - It is the root component (`app-root`).
     * - It has multiple parent components, all of which have defined routes.
     * @param parents A list of parent component selectors.
     * @param routeMap The `RouteMap` used to verify the existence of routes.
     * @returns `true` if the component is a global component, `false` otherwise.
     */
    private isGlobalComponent(parents: string[], routeMap: RouteMap): boolean {
        return parents.includes('app-root')
            || (parents.length > 1 && parents.every(parent => RouteMapUtils.getRouteFromSelector(parent, routeMap)));
    }
}