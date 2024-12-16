import * as ts from 'ts-morph';
import * as path from "path";
import { RouteAnalyzer } from '../analyzers/route-analyzer.js';
import { TemplateAnalyzer } from '../analyzers/template-analyzer.js';
import { LogicAnalyzer } from '../analyzers/logic-analyzer.js';
import { NavigationGraph } from '../models/navigation-graph.js';
import { NavigationGraphBuilder } from '../builders/navigation-graph-builder.js';

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
        this.templateAnalyzer = new TemplateAnalyzer();
        this.logicAnalyzer = new LogicAnalyzer();
        this.graphBuilder = new NavigationGraphBuilder();
        this.routeAnalyzer = new RouteAnalyzer(this.graphBuilder);
    }

    async analyze(): Promise<NavigationGraph> {
        // Step 1: Extract routes with component associations
        const appModulePath = path.join(this.projectPath, 'src', 'app', 'app.module.ts');
        const routeFile = this.project.getSourceFileOrThrow(appModulePath);
        const routeMap = await this.routeAnalyzer.analyze(routeFile);

        // Step 2: Extract Widgets and Event Handlers
        for (const file of this.project.getSourceFiles()) {
            for (const cls of file.getClasses()) {
                const decorator = cls.getDecorator('Component');
                if (decorator) {
                    const template = this.templateAnalyzer.extractTemplate(decorator);
                    const routeId = routeMap.get(cls.getName() || ''); // Get route for the component

                    if (!routeId)
                        console.log(`Component ${cls.getName()} has no associated route.`);

                    if (template) {
                        const widgets = await this.templateAnalyzer.analyze(template);
                        const handlers = this.logicAnalyzer.analyze(file);
                        await this.graphBuilder.addWidgets(widgets, handlers, routeId); // Pass route context
                    }
                }
            }
        }

        // Return the built graph
        return this.graphBuilder.build();
    }
}