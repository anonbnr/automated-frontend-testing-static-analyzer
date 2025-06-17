// ──────────────────────────────────────────────────────────────────────────────
// logic-utils.ts
//
// Utility functions for business-logic analysis of Angular components.
// Houses shared helpers used by `LogicAnalyzer` and other analysis classes.
// ──────────────────────────────────────────────────────────────────────────────

import { Decorator, SourceFile, SyntaxKind } from "ts-morph";

/**
 * A collection of static helper methods for locating and extracting
 * metadata from Angular component classes within a ts-morph `SourceFile`.
 */
export class LogicUtils {
    /**
     * Scans a `SourceFile` and returns the first `ClassDeclaration`
     * decorated with `@Component(...)`.
     *
     * @param file
     *   The ts-morph `SourceFile` to inspect, typically a `<name>.component.ts` file.
     * @returns
     *   The `ClassDeclaration` node decorated with `@Component`, or `undefined`
     *   if no such class is found.
     *
     * @example
     * ```ts
     * const project = new Project({ tsConfigFilePath: "./tsconfig.json" });
     * const sf = project.getSourceFile("app.component.ts")!;
     * const comp = LogicUtils.getPrimaryComponentClass(sf);
     * if (comp) console.log("Found component:", comp.getName());
     * ```
     */
    static getPrimaryComponentClass(file: SourceFile) {
        return file.getClasses().find(c => c.getDecorator('Component') !== undefined);
    }

    /**
     * Extracts the `selector` string from a `@Component` decorator.
     *
     * @param decorator
     *   A ts-morph `Decorator` node corresponding to `@Component(...)`.
     * @returns
     *   The selector value (e.g. `'app-header'`), or `undefined` if the decorator
     *   has no `selector` property.
     *
     * @example
     * ```ts
     * const dec = compClass.getDecorator("Component")!;
     * const sel = LogicUtils.getSelectorFromDecorator(dec);
     * console.log("Selector:", sel); // e.g. "app-header"
     * ```
     */
    static getSelectorFromDecorator(dec: Decorator): string | undefined {
        return dec
            ?.getArguments()[0]
            .asKind(SyntaxKind.ObjectLiteralExpression)
            ?.getProperty("selector")
            ?.asKind(SyntaxKind.PropertyAssignment)
            ?.getInitializer()
            ?.asKind(SyntaxKind.StringLiteral)
            ?.getLiteralText();
    }
}