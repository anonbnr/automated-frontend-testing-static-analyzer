// ──────────────────────────────────────────────────────────────────────────────
// builders/component-registry-builder.ts
//
// Scans a ts-morph Project for every `@Component` class and builds a
// ComponentRegistry:
//   - Discovers classes with `@Component(...)`
//   - Extracts either inline `template` or external `templateUrl`
//   - Invokes `TemplateAnalyzer` to produce a ComponentInfo (selector, class,
//     widget hierarchy, nested selectors)
//   - Aggregates all ComponentInfo into a ComponentRegistry
// ──────────────────────────────────────────────────────────────────────────────

import { Project, SyntaxKind } from "ts-morph";
import { TemplateAnalyzer } from "../analyzers/template/template-analyzer.js";
import { TemplateUtils } from "../analyzers/template/template-utils.js";
import logger from "../logging/logger.js";
import { ComponentInfo, ComponentRegistry } from "../models/component-info.js";

/**
 * Builds a registry of all Angular components in a project.
 */
export class ComponentRegistryBuilder {

    /**
     * @param project  A ts-morph Project initialized with the Angular tsconfig.
     */
    constructor(private project: Project) { }

    /**
     * Scans every `.ts` file for classes decorated with `@Component`,
     * loads each template (inline or via `templateUrl`), analyzes it,
     * and returns a ComponentRegistry containing every ComponentInfo.
     */
    async buildComponentsRegistry(): Promise<ComponentRegistry> {
        logger.info("[ComponentRegistryBuilder] Scanning for @Component classes…");
        const components: ComponentInfo[] = [];

        const sourceFiles = this.project.getSourceFiles();
        logger.debug(`[ComponentRegistryBuilder] Project contains ${sourceFiles.length} source files`);

        // 1) Iterate through every source file in the project
        for (const sourceFile of sourceFiles) {
            const filePath = sourceFile.getFilePath();
            // Skip non-TypeScript files (e.g., templates, styles, etc.)
            if (!filePath.endsWith(".ts")) {
                logger.log('trace', "[ComponentRegistryBuilder] Skipping non-.ts file %s", filePath);
                continue;
            }

            // 2) Look for @Component on each class
            logger.log('trace', "[ComponentRegistryBuilder] Inspecting %s", filePath);
            for (const classDecl of sourceFile.getClasses()) {
                const className = classDecl.getName() ?? "<anonymous>";
                logger.log('trace', "[ComponentRegistryBuilder] Examining class %s", className);

                const dec = classDecl
                    .getDecorators()
                    .find((dec) => dec.getName() === "Component");

                // Not an Angular component
                if (!dec) {
                    logger.debug("[ComponentRegistryBuilder] No @Component decorator on %s", className);
                    continue;
                }

                // 3) Quick sanity check: must have a selector property
                const objLit = dec
                    .getArguments()[0]
                    .asKind(SyntaxKind.ObjectLiteralExpression);
                if (!objLit?.getProperty("selector")) {
                    // no selector ⇒ skip
                    logger.warn(
                        "[ComponentRegistryBuilder] Skipping '%s' (no selector in @Component)",
                        className
                    );
                    continue;
                }

                logger.info("[ComponentRegistryBuilder] Found @Component %s", className);

                // 4) Extract the raw template string
                logger.debug("[ComponentRegistryBuilder] Extracting template for %s", className);
                const analyzer = new TemplateAnalyzer(dec);
                const templateText = TemplateUtils.extractTemplate(dec);
                if (!templateText) {
                    // No inline `template` or `templateUrl` found → likely not a component,
                    // or the template file was missing. Skip with a warning.
                    logger.warn(
                        "[ComponentRegistryBuilder] No template found for '%s' in %s",
                        className,
                        filePath
                    );
                    continue;
                }

                // 5) Delegate to TemplateAnalyzer to build ComponentInfo
                try {
                    logger.debug("[ComponentRegistryBuilder] Analyzing template for %s", className);
                    const componentInfo = await analyzer.analyze(templateText);
                    components.push(componentInfo);
                    logger.info(
                        "[ComponentRegistryBuilder] Analyzed component %s → selector='%s', widgets=%d, nested=%d",
                        className,
                        componentInfo.selector,
                        componentInfo.widgets.length,
                        componentInfo.nestedComponents.length
                    );
                } catch (err) {
                    logger.error(
                        "[ComponentRegistryBuilder] Error analyzing template for %s: %o",
                        className,
                        err
                    );
                }
            }
        }

        logger.info(
            "[ComponentRegistryBuilder] Built registry with %d components",
            components.length
        );

        // 6) Return the assembled registry
        return new ComponentRegistry(components);
    }
}