// ──────────────────────────────────────────────────────────────────────────────
// parsers/ast-utils.ts
//
// Purpose
//   Central ts-morph helpers used across analyzers to read decorator/object
//   literals, extract Angular @Component metadata, and convert between selector
//   and class-name conventions.
//
// Provided helpers
// 1) ObjectLiteralExpression
//    - hasProp                : check for a property by name
//    - getPropAsText          : read a scalar initializer value as text (unquoted)
//    - getPropAsStringArray   : read an array of string/identifier elements
//    - getPropAsObjectLiteral : read a shallow object literal as a plain map
//    - getPropInitializer     : get the raw initializer Expression
//
// 2) Decorator (@Component) helpers
//    - getComponentObjectLiteral : locate the object literal in @Component(...)
//    - getPropertyFromDecorator  : read a string property (selector, templateUrl, …)
//    - getSelectorFromDecorator  : extract the component selector
//    - getClassNameFromDecorator : infer the component class name
//
// 3) Component scanning
//    - getPrimaryComponentClass  : find the first @Component class in a file
//
// 4) Selector ↔ ClassName
//    - convertSelectorToClassName : "app-foo-bar" → "FooBarComponent"
//    - convertClassNameToSelector : "FooBarComponent" → "foo-bar"
// ──────────────────────────────────────────────────────────────────────────────

import { ClassDeclaration, Decorator, Expression, ObjectLiteralExpression, PropertyAssignment, SourceFile, SyntaxKind } from "ts-morph";

export class AstUtils {
    // ──────────────── Internal helpers ────────────────

    /** Strip wrapping single/double/backtick quotes if present. */
    private static _stripQuotes(text: string): string {
        return text.replace(/^['"`](.*)['"`]$/s, "$1");
    }

    /** Safe `.getText()` + unquote helper. */
    private static _textOf(expr: Expression | undefined): string | undefined {
        return expr ? this._stripQuotes(expr.getText()) : undefined;
    }

    /** Returns the property assignment named `key` of `obj`, if it exists. */
    private static _getAssignment(
        obj: ObjectLiteralExpression,
        key: string
    ): PropertyAssignment | undefined {
        const prop = obj.getProperty(key);
        return prop?.asKind(SyntaxKind.PropertyAssignment);
    }

    // ──────────────── ObjectLiteralExpression Helpers ────────────────

    /** True if `obj` has a property named `key`. */
    static hasProp(obj: ObjectLiteralExpression, key: string): boolean {
        return obj.getProperty(key) !== undefined;
    }

    /** Raw initializer Expression for `key`, or `undefined` if absent. */
    static getPropInitializer(obj: ObjectLiteralExpression, key: string): Expression | undefined {
        const assign = this._getAssignment(obj, key);
        return assign?.getInitializer();
    }

    /**
    * Read `key: 'text'`, `key: "text"`, `key: identifier`, or any initializer
    * as unquoted text. Returns `undefined` if missing.
    */
    static getPropAsText(obj: ObjectLiteralExpression, key: string): string | undefined {
        return this._textOf(this.getPropInitializer(obj, key));
    }

    /**
    * Read `key: [ A, B, C ]` where each element is a literal or identifier and
    * return an array of their unquoted text forms. Returns `[]` if missing.
    */
    static getPropAsStringArray(obj: ObjectLiteralExpression, key: string): string[] {
        const init = this.getPropInitializer(obj, key);
        if (!init?.isKind(SyntaxKind.ArrayLiteralExpression))
            return [];

        return init
            .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
            .getElements()
            .map((el) => this._stripQuotes(el.getText()));
    }

    /**
    * Read `key: { a: X, b: Y }` and return a shallow plain map
    * `{ a: text(X), b: text(Y) }`. Returns `{}` if missing or not an object.
    *
    * Notes:
    *  • Only handles `PropertyAssignment` entries (no spread/shorthand).
    *  • Keys are returned as written (quoted/unquoted names both normalized to text).
    */
    static getPropAsObjectLiteral(obj: ObjectLiteralExpression, key: string): Record<string, string> {
        const init = this.getPropInitializer(obj, key);
        if (!init?.isKind(SyntaxKind.ObjectLiteralExpression))
            return {};

        const result: Record<string, string> = {};
        const objLit = init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

        for (const p of objLit.getProperties()) {
            if (!p.isKind(SyntaxKind.PropertyAssignment))
                continue;

            const pa = p as PropertyAssignment;
            const k = this._stripQuotes(pa.getName());
            const v = this._textOf(pa.getInitializer());
            if (v !== undefined) result[k] = v;
        }
        return result;
    }

    // ──────────────── Decorator Helpers (Angular @Component) ────────────────

    /**
    * Retrieve the object literal passed to `@Component(...)`, if any.
    */
    static getComponentObjectLiteral(decorator: Decorator): ObjectLiteralExpression | undefined {
        const args = decorator.getArguments();
        if (!args.length)
            return undefined;

        return args[0].asKind(SyntaxKind.ObjectLiteralExpression);
    }

    /**
    * Read a string-like property (e.g., "selector", "templateUrl") from the \@Component decorator.
    * Returns the unquoted value, or `undefined` if missing.
    */
    static getPropertyFromDecorator(decorator: Decorator, name: string): string | undefined {
        const objLiteral = this.getComponentObjectLiteral(decorator);
        return objLiteral ? this.getPropAsText(objLiteral, name) : undefined;
    }

    /** Extract `selector: 'app-…'` from the \@Component decorator. */
    static getSelectorFromDecorator(decorator: Decorator): string | undefined {
        return this.getPropertyFromDecorator(decorator, 'selector');
    }

    /**
    * Infer the component class name by walking up from the decorator
    * to its parent `ClassDeclaration`.
    */
    static getClassNameFromDecorator(decorator: Decorator): string | undefined {
        const cls = decorator.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
        return cls?.getName();
    }

    // ──────────────── Selector ↔ ClassName ────────────────

    /**
    * "app-foo-bar" → "FooBarComponent".
    * If the selector has no hyphen (no prefix), returns "".
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
    * "FooBarComponent" → "foo-bar" (does *not* add "app-" or any prefix).
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
    * Return the first class in `file` that is decorated with `@Component(...)`,
    * or `undefined` if none is found.
    */
    static getPrimaryComponentClass(file: SourceFile): ClassDeclaration | undefined {
        return file
            .getClasses()
            .find(c => c.getDecorator("Component") !== undefined);
    }
}