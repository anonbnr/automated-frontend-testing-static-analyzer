import * as path from "path";
import * as ts from 'ts-morph';
import { LogicAnalyzer } from '../analyzers/logic-analyzer.js';
import { RouteAnalyzer } from '../analyzers/route-analyzer.js';
import { TemplateAnalyzer } from '../analyzers/template-analyzer.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';
import { NavigationGraph, RouteMap } from '../models/navigation-graph.js';

export class StaticAnalyzer {
    private project: ts.Project;
    private projectPath: string;
    private routeAnalyzer: RouteAnalyzer;
    private templateAnalyzer: TemplateAnalyzer;
    private logicAnalyzer: LogicAnalyzer;
    private graphBuilder: NavigationGraphBuilder;

    constructor(tsConfigPath: string) {
        // Initialize the TypeScript project
        this.project = new ts.Project({
            tsConfigFilePath: tsConfigPath,
        });
        this.projectPath = tsConfigPath.substring(0, tsConfigPath.lastIndexOf(path.sep));
        this.graphBuilder = new NavigationGraphBuilder();
        this.routeAnalyzer = new RouteAnalyzer();
        this.templateAnalyzer = new TemplateAnalyzer();
        this.logicAnalyzer = new LogicAnalyzer();
    }

    async analyze(): Promise<NavigationGraph> {
        // Step 1: Build route nodes and transitions and extract route map
        const routeMap = await this.buildRoutes();

        // Step 3: Extract Widgets and Event Handlers
        for (const file of this.project.getSourceFiles()) {
            for (const cls of file.getClasses()) {
                const decorator = cls.getDecorator('Component');
                if (decorator) {
                    const route = this.getComponentRoute(cls, routeMap);
                    const template = this.templateAnalyzer.extractTemplate(decorator);

                    if (template) {
                        const widgets = await this.templateAnalyzer.analyze(template);
                        const handlers = this.logicAnalyzer.analyze(file);
                        await this.graphBuilder.addWidgets(widgets, handlers, route); // Pass route context
                    }
                }
            }
        }

        // Return the built graph
        return this.graphBuilder.build();
    }

    private async buildRoutes(): Promise<RouteMap> {
        // Step 1: Extract component and redirection routes
        const appModulePath = path.join(this.projectPath, 'src', 'app', 'app.module.ts');
        const routeFile = this.project.getSourceFileOrThrow(appModulePath);
        const routeMap = await this.routeAnalyzer.analyze(routeFile);

        // Step 2: Add Route nodes to graph
        for (const { component, route } of routeMap.components) {
            await this.graphBuilder.addRoute(`/${route}`);
            console.log(`Route node added in graph for route /${route}`); // Debug log
        }

        for (const { route, redirectTo } of routeMap.redirections) {
            await this.graphBuilder.addRouteRedirect(`/${route}`, `/${redirectTo}`);
            console.log(`Transition added in graph for redirection: /${route} -> /${redirectTo}`); // Debug log
        }

        return routeMap;
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
}