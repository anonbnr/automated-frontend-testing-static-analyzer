// ──────────────────────────────────────────────────────────────────────────────
// builders/component-registry-builder.ts
//
// Purpose
//   Walk a ts-morph Project, discover every Angular `@Component` class,
//   analyze its template (inline or external), and aggregate results into a
//   `ComponentRegistry` (selector, class name, widget hierarchy, nested selectors).
//
// Pipeline
//   1) Source scan        → iterate .ts files only
//   2) Component detect   → classes decorated with @Component(...)
//   3) Sanity check       → require a 'selector' entry in the decorator object
//   4) Template resolve   → TemplateUtils.extractTemplate (templateUrl preferred,
//                          otherwise inline 'template')
//   5) Analyze template   → TemplateAnalyzer.analyze → ComponentInfo
//   6) Aggregate          → return new ComponentRegistry(ComponentInfo[])
//
// Notes
//   • Skips files that are not `.ts`.
//   • Logs verbosely (trace/debug/info) to help diagnose missing selectors,
//     unreadable/missing templates, or analysis errors.
//   • A component without a resolvable template is skipped with a warning
//     (it may be abstract, test-only, or its template file is missing).
// ──────────────────────────────────────────────────────────────────────────────

import { Project, SyntaxKind } from "ts-morph";
import { TemplateAnalyzer } from "../analyzers/template/template-analyzer.js";
import { TemplateUtils } from "../analyzers/template/template-utils.js";
import logger from "../logging/logger.js";
import { ComponentInfo, ComponentRegistry } from "../models/component-info.js";

/**
 * Builder that constructs a `ComponentRegistry` by scanning all `@Component` classes
 * in a ts-morph Project and analyzing their templates.
 */
export class ComponentRegistryBuilder {

    /**
    * @param project  A ts-morph Project initialized with the Angular workspace tsconfig.
    */
    constructor(private project: Project) { }

    /**
    * Scans every `.ts` file for classes decorated with `@Component`,
    * loads each template (inline or via `templateUrl`), analyzes it,
    * and returns a `ComponentRegistry` containing every `ComponentInfo`.
    *
    * @returns A registry of all analyzed components in the project.
    */
    async buildComponentsRegistry(): Promise<ComponentRegistry> {
        logger.info("[ComponentRegistryBuilder] Scanning for @Component classes…");
        const components: ComponentInfo[] = [];

        const sourceFiles = this.project.getSourceFiles();
        logger.debug(`[ComponentRegistryBuilder] Project contains ${sourceFiles.length} source files`);

        // 1) Iterate through every source file in the project
        for (const sourceFile of sourceFiles) {
            const filePath = sourceFile.getFilePath();

            // Skip non-TypeScript files (e.g., .html, .scss, generated assets)
            if (!filePath.endsWith(".ts")) {
                logger.log('trace', "[ComponentRegistryBuilder] Skipping non-.ts file %s", filePath);
                continue;
            }

            // 2) Search for classes decorated with @Component
            logger.log('trace', "[ComponentRegistryBuilder] Inspecting %s", filePath);
            for (const classDecl of sourceFile.getClasses()) {
                const className = classDecl.getName() ?? "<anonymous>";
                logger.log('trace', "[ComponentRegistryBuilder] Examining class %s", className);

                const dec = classDecl
                    .getDecorators()
                    .find((dec) => dec.getName() === "Component");

                // Not an Angular component → continue
                if (!dec) {
                    logger.debug("[ComponentRegistryBuilder] No @Component decorator on %s", className);
                    continue;
                }

                // 3) Quick sanity check: must have a selector in the decorator object
                const objLit = dec
                    .getArguments()[0]
                    .asKind(SyntaxKind.ObjectLiteralExpression);
                if (!objLit?.getProperty("selector")) {
                    // Missing selector ⇒ skip (cannot index the component)
                    logger.warn(
                        "[ComponentRegistryBuilder] Skipping '%s' (no selector in @Component)",
                        className
                    );
                    continue;
                }

                logger.info("[ComponentRegistryBuilder] Found @Component %s", className);

                // 4) Extract the raw template string (external preferred)
                logger.debug("[ComponentRegistryBuilder] Extracting template for %s", className);
                const analyzer = new TemplateAnalyzer(dec);
                const templateText = TemplateUtils.extractTemplate(dec);
                if (!templateText) {
                    // No inline template or unreadable templateUrl → skip with warning
                    logger.warn(
                        "[ComponentRegistryBuilder] No template found for '%s' in %s",
                        className,
                        filePath
                    );
                    continue;
                }

                // 5) Analyze the template to build ComponentInfo
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
                    // Non-fatal: continue with other components
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

        // 6) Aggregate into a registry snapshot (read-only via its API)
        return new ComponentRegistry(components);
    }
}