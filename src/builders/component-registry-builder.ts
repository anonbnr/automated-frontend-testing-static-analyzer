// ──────────────────────────────────────────────────────────────────────────────
// component-registry-builder.ts
//
// A `ComponentRegistryBuilder` that:
//
//   1) Scans a `ts-morph` Project for every class decorated with `@Component(...)`.
//   2) For each component, determines whether it uses an inline `template` or a
//      `templateUrl`, then loads the full template text.
//   3) Invokes `TemplateAnalyzer` on each template to extract `ComponentInfo`
//      (selector, class name, widgets, nested child selectors).
//   4) Aggregates all `ComponentInfo` into a `ComponentRegistry`.
//
// The resulting `ComponentRegistry` contains one entry for every Angular component
// in the workspace, including information about its interactive widgets and any
// nested `<app-*>` child components.
//
// Usage example:
// ```ts
// const project = new Project({ tsConfigFilePath: "/path/to/tsconfig.json" });
// const registry = await ComponentRegistryBuilder.buildComponentsRegistry(project);
// console.log(registry.components); // Array of ComponentInfo
// ```
// ──────────────────────────────────────────────────────────────────────────────

import { Project, SyntaxKind } from "ts-morph";
import { ComponentInfo, ComponentRegistry } from "../models/component-info.js";
import { TemplateAnalyzer } from "../analyzers/template/template-analyzer.js";

export class ComponentRegistryBuilder {

    constructor(private project: Project) { }

    /**
     * Scans the entire `ts-morph` Project for classes decorated with `@Component(...)`,
     * loads each component’s template (inline or via `templateUrl`), and uses
     * `TemplateAnalyzer` to produce a `ComponentInfo` for each one. Returns a
     * `ComponentRegistry` containing all discovered components.
     *
     * @param project
     *   The `ts-morph` Project representing the Angular workspace. Must have been
     *   initialized with the correct `tsconfig.json`.
     * @returns
     *   A Promise resolving to a `ComponentRegistry` whose `components` array
     *   contains a `ComponentInfo` entry for every `@Component(...)` found.
     */
    async buildComponentsRegistry(): Promise<ComponentRegistry> {
        const components: ComponentInfo[] = [];

        // 1) Iterate through every source file in the project
        for (const sourceFile of this.project.getSourceFiles()) {
            // Skip non-TypeScript files (e.g., templates, styles, etc.)
            if (!sourceFile.getFilePath().endsWith(".ts"))
                continue;

            // 2) For each class declaration, check for a `@Component` decorator
            for (const classDecl of sourceFile.getClasses()) {
                const compDecorator = classDecl
                    .getDecorators()
                    .find((dec) => dec.getName() === "Component");

                // Not an Angular component
                if (!compDecorator)
                    continue;

                // Verify that the component is not dummy and has a selector
                const objLit = compDecorator
                    .getArguments()[0]
                    .asKind(SyntaxKind.ObjectLiteralExpression);
                if (!objLit || !objLit.getProperty("selector")) {
                    // no selector ⇒ skip
                    console.warn(
                        `[ComponentRegistryBuilder] Skipping '${classDecl.getName()}' ` +
                        `(no selector in @Component decorator)`
                    );
                    continue;
                }

                // 3) Use TemplateAnalyzer to extract the raw template string
                const analyzer = new TemplateAnalyzer(compDecorator);
                const templateText = analyzer.extractTemplate();
                if (templateText === null) {
                    // No inline `template` or `templateUrl` found → likely not a component,
                    // or the template file was missing. Skip with a warning.
                    console.warn(`[ComponentRegistryBuilder] No template found for '${classDecl.getName()}' at "${sourceFile.getFilePath()}"`);
                    continue;
                }

                // 4) Analyze the template to produce a ComponentInfo
                let componentInfo: ComponentInfo;
                try {
                    componentInfo = await analyzer.analyze(templateText);
                } catch (err) {
                    console.error(`[ComponentRegistryBuilder] Failed to analyze template for '${classDecl.getName()}' at "${sourceFile.getFilePath()}":`, err);
                    // Skip this component if analysis fails
                    continue;
                }

                components.push(componentInfo);
            }
        }

        // 5) Return the registry containing all successfully analyzed components
        return new ComponentRegistry(components);
    }
}