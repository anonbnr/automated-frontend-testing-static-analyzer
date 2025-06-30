// ──────────────────────────────────────────────────────────────────────────────
// parsers/ast-utils.ts
//
// Central AST utilities for ts-morph-based analysis, including:
//
// 1. **ObjectLiteralExpression** helpers:
//    - hasProp                   — check for a property by name
//    - getPropAsText             — read a string or identifier value
//    - getPropAsStringArray      — read an array of string literals
//    - getPropAsObjectLiteral    — read an object literal into a plain map
//    - getPropInitializer        — get the raw Expression for further inspection
//
// 2. **Decorator** helpers (Angular `@Component`):
//    - getComponentObjectLiteral — locate the object literal in `@Component(...)`
//    - getPropertyFromDecorator  — read a string property (selector, templateUrl, etc.)
//    - getSelectorFromDecorator  — extract the component’s selector
//    - getClassNameFromDecorator — infer the component’s class name
//
// 3. **Component scanning**:
//    - getPrimaryComponentClass  — find the first `@Component` class in a SourceFile
//
// 4. **Selector ↔ ClassName**:
//    - convertSelectorToClassName — map kebab-case selector to PascalCase class name
//    - convertClassNameToSelector — map PascalCase class name to kebab-case selector
// ──────────────────────────────────────────────────────────────────────────────

import { ClassDeclaration, Decorator, Expression, ObjectLiteralExpression, PropertyAssignment, SourceFile, SyntaxKind } from "ts-morph";

export class AstUtils {
    // ──────────────── ObjectLiteralExpression Helpers ────────────────
    /**
     * Returns true if `obj` has a property assignment named `key`.
     */
    static hasProp(obj: ObjectLiteralExpression, key: string): boolean {
        return obj.getProperty(key) !== undefined;
    }

    /**
     * Returns the property assignment named `key` of `obj`
     */
    private static _getAssignment(obj: ObjectLiteralExpression, key: string): PropertyAssignment | undefined {
        const prop = obj.getProperty(key);
        return prop?.asKind(SyntaxKind.PropertyAssignment);
    }

    /**
     * Returns the raw `Expression` initializer for `key`, or undefined if none.
     */
    static getPropInitializer(obj: ObjectLiteralExpression, key: string): Expression | undefined {
        const assign = this._getAssignment(obj, key);
        const init = assign?.getInitializer();
        return init;
    }

    /**
     * Reads `key: 'text'` or `key: identifier` (or any initializer),
     * strips any surrounding quotes, and returns its text.
     * If missing or not a PropertyAssignment, returns undefined.
     */
    static getPropAsText(obj: ObjectLiteralExpression, key: string): string | undefined {
        return this.getPropInitializer(obj, key)
            ?.getText()
            .replace(/^['"`](.*)['"`]$/s, "$1");
    }

    /**
     * Reads `key: [ A, B, C ]` where each element is a literal or identifier.
     * Returns an array of their stripped-text values, or [] if none.
     */
    static getPropAsStringArray(obj: ObjectLiteralExpression, key: string): string[] {
        const init = this.getPropInitializer(obj, key);
        if (!init?.isKind(SyntaxKind.ArrayLiteralExpression))
            return [];

        return init
            .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
            .getElements()
            .map(el => el
                .getText()
                .replace(/^['"`](.*)['"`]$/s, "$1")
            );
    }

    /**
     * Reads `key: { a: X, b: Y }` and returns a plain `{ a: text(X), b: text(Y) }`.
     * If missing or not an object literal, returns `{}`.
     */
    static getPropAsObjectLiteral(obj: ObjectLiteralExpression, key: string): Record<string, string> {
        const init = this.getPropInitializer(obj, key);
        if (!init?.isKind(SyntaxKind.ObjectLiteralExpression))
            return {};

        const result: Record<string, string> = {};
        for (const p of init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperties()) {
            if (!p.isKind(SyntaxKind.PropertyAssignment))
                continue;

            const pa = p as PropertyAssignment;
            const v = pa.getInitializer();
            if (!v)
                continue;

            result[pa.getName()] = v
                .getText()
                .replace(/^['"`](.*)['"`]$/s, "$1");
        }
        return result;
    }

    // ──────────────── Decorator Helpers (Angular @Component) ────────────────
    /**
     * Retrieves the ObjectLiteralExpression passed to `@Component(...)`.
     *
     * @param decorator  The ts-morph Decorator node for `@Component`.
     * @returns          The object literal, or `undefined` if not found.
     */
    static getComponentObjectLiteral(decorator: Decorator): ObjectLiteralExpression | undefined {
        const args = decorator.getArguments();
        if (!args.length)
            return undefined;

        return args[0].asKind(SyntaxKind.ObjectLiteralExpression);
    }

    /**
     * Reads a string property (e.g. 'selector', 'templateUrl') from the @Component decorator.
     *
     * @param decorator  The ts-morph Decorator node for `@Component`.
     * @param name       The property name to read.
     * @returns          The unquoted string value, or `undefined` if missing.
     */
    static getPropertyFromDecorator(decorator: Decorator, name: string): string | undefined {
        const objLiteral = this.getComponentObjectLiteral(decorator);
        return objLiteral && this.getPropAsText(objLiteral, name);
    }

    /**
     * Extracts `selector: 'app-…'` from the @Component decorator.
     *
     * @param decorator  The ts-morph Decorator node for `@Component`.
     * @returns          The selector (e.g. 'app-header'), or `undefined` if not present.
     */
    static getSelectorFromDecorator(decorator: Decorator): string | undefined {
        return this.getPropertyFromDecorator(decorator, 'selector');
    }

    /**
     * Infers the component class name by walking up from the decorator
     * to its parent ClassDeclaration.
     *
     * @param decorator  The ts-morph Decorator node for `@Component`.
     * @returns          The class name (e.g. 'MyHeaderComponent'), or `undefined` if unavailable.
     */
    static getClassNameFromDecorator(decorator: Decorator): string | undefined {
        const cls = decorator.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
        return cls?.getName();
    }

    // ──────────────── Selector ↔ ClassName ────────────────
    /**
     * Converts a kebab-case selector (e.g. `app-foo-bar`) into a
     * PascalCase class name (e.g. `FooBarComponent`).
     */
    static convertSelectorToClassName(selector: string): string {
        const parts = selector.split("-");
        return parts.length > 1
            ? parts
                .slice(1)
                .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                .concat("Component")
                .join('')
            : '';
    }

    /**
     * Inverse of `convertSelectorToClassName()`: given `FooBarComponent`
     * returns `"foo-bar"`.  (Does *not* re-add any prefix like `"app-"`.)
     *
     * @param className
     *   The component’s class name (e.g. `"FooBarComponent"`).
     * @returns
     *   The kebab-case base selector (e.g. `"foo-bar"`).
     */
    static convertClassNameToSelector(className: string): string {
        // Strip the "Component" suffix if present
        const base = className.replace(/Component$/, "");
        // Insert hyphens before uppercase letters, then lowercase
        return base
            .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
            .toLowerCase();
    }


    // ──────────────── Component Scanning ────────────────
    /**
     * Returns the first `ClassDeclaration` in `file` decorated with `@Component(...)`,
     * or `undefined` if none is found.
     */
    static getPrimaryComponentClass(file: SourceFile): ClassDeclaration | undefined {
        return file
            .getClasses()
            .find(c => c.getDecorator("Component") !== undefined);
    }
}