// ──────────────────────────────────────────────────────────────────────────────
// builders/module-registry-builder.ts
//
// Purpose
//   Two-phase builder that discovers Angular @NgModule metadata and produces
//   a ModuleRegistry. It also annotates routes with their declaring module
//   and flags lazy-loaded modules.
//
// Phases
//   1) discoverModules()
//        • Scans every @NgModule across the Project
//        • Extracts imports / declarations / exports / bootstrap
//        • Classifies role: 'root' | 'routing' | 'external' | 'shared' | 'global'
//   2) assignRoutesToModules(ComponentRouteMap)
//        • For lazy routes (loadChildren), sets ModuleInfo.lazy = true and tags route.module
//        • For eager routes (component), tags route.module by declaration owner
//
// Output
//   • `.registry` → ModuleRegistry snapshot for downstream analyzers/builders.
//
// Notes
//   • Role classification:
//       - 'root'     → has bootstrap entries
//       - 'routing'  → imports include RouterModule.forRoot/forChild
//       - 'external' → declares nothing and only imports from non-relative packages
//       - 'shared'   → default for non-root/non-routing/local modules
//       - 'global'   → promoted from 'shared' if imported directly by the root module
//   • Lazy detection is based on the standard dynamic import then(..) pattern,
//     e.g. loadChildren: () => import('./x').then(m => m.FooModule).
// ──────────────────────────────────────────────────────────────────────────────

import { Project, SourceFile, SyntaxKind } from "ts-morph";
import logger from "../logging/logger.js";
import { ModuleInfo, ModuleRegistry, ModuleRole } from "../models/module-info.js";
import { ComponentRouteMap } from "../models/route-info.js";
import { AstUtils } from "../parsers/ast-utils.js";

/**
 * Two-phase @NgModule registry builder.
 *
 * 1) discoverModules()
 *    - Walk all source files for @NgModule classes
 *    - Capture ModuleInfo entries (lazy=false initially)
 *    - Classify roles (root/routing/external/shared, later 'global')
 *
 * 2) assignRoutesToModules(compRouteMap)
 *    - For each route, infer and assign the declaring module name
 *    - Mark ModuleInfo.lazy=true when referenced by loadChildren
 *
 * Usage:
 * ```ts
 * const builder = new ModuleRegistryBuilder(project);
 * await builder.discoverModules();
 * builder.assignRoutesToModules(componentRouteMap);
 * const registry = builder.registry;
 * ```
 */
export class ModuleRegistryBuilder {
    /** Accumulated ModuleInfo snapshot (rebuilt on discoverModules). */
    private _modules: ModuleInfo[] = [];

    /** Lazily-constructed registry exposing read-only access to `_modules`. */
    private _registry!: ModuleRegistry;

    /**
    * @param project A ts-morph Project configured with the Angular workspace tsconfig.
    */
    constructor(private project: Project) { }

    /**
    * Read-only view of the discovered modules.
    * Constructed on first access to mirror the current `_modules` snapshot.
    */
    get registry(): ModuleRegistry {
        if (!this._registry) {
            this._registry = new ModuleRegistry(this._modules);
            logger.debug("[ModuleRegistryBuilder] ModuleRegistry constructed");
        }
        return this._registry;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Phase 1 — Discovery & Role Classification
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Scans the Project for @NgModule declarations and classifies each module's role.
    *
    * Workflow:
    *  • Reset internal state
    *  • For each .ts file:
    *      - For each class with @NgModule({...}):
    *          · Extract imports/declarations/exports/bootstrap
    *          · Classify role = root | routing | external | shared
    *          · Push ModuleInfo (lazy=false)
    *  • Promote 'global' modules (shared modules directly imported by the root module)
    *
    * Side effects:
    *  • Overwrites `_modules` with the new snapshot
    *
    * @returns Promise<void> that resolves when discovery completes.
    */
    async discoverModules(): Promise<void> {
        logger.info('[ModuleRegistryBuilder] Starting module discovery');
        this._modules = []; // reset from previous runs

        // Iterate every source file for @NgModule classes
        for (const sf of this.project.getSourceFiles()) {
            // Only consider TS files
            if (!sf.getFilePath().endsWith(".ts")) {
                logger.log('trace', "[ModuleRegistryBuilder] Skipping non-TS file %s", sf.getFilePath());
                continue;
            }

            for (const cls of sf.getClasses()) {
                // Find @NgModule decorator
                const dec = cls.getDecorator('NgModule');
                if (!dec) continue;

                // Extract the object literal passed to @NgModule({...})
                const objLit = dec.getArguments()[0].asKind(SyntaxKind.ObjectLiteralExpression);
                if (!objLit) {
                    logger.warn(
                        "[ModuleRegistryBuilder] @NgModule decorator has no ObjectLiteral in %s",
                        sf.getFilePath()
                    );
                    continue;
                }

                // Basic identifiers (class name and file path)
                const name = cls.getName()!;
                const filePath = sf.getFilePath();

                // Extract arrays from the decorator (imports/declarations/exports)
                const imports = AstUtils.getPropAsStringArray(objLit, 'imports');
                const declarations = AstUtils.getPropAsStringArray(objLit, 'declarations');
                const exports = AstUtils.getPropAsStringArray(objLit, 'exports');
                const bootstrap = AstUtils.getPropAsStringArray(objLit, 'bootstrap');

                // Role classification (initial)
                const isRoot = bootstrap.length > 0;
                const hasRouting = imports.some(i => /RouterModule\.(forRoot|forChild)/.test(i));
                const isExternal = this._isExternalModule(sf, imports, declarations);

                const role: ModuleRole = isRoot
                    ? "root"
                    : hasRouting
                        ? "routing"
                        : isExternal
                            ? "external"
                            : "shared";

                logger.info(`[ModuleRegistryBuilder] Found @NgModule %s (role=%s) in %s`, name, role, filePath);

                // Record module snapshot (lazy resolved later)
                this._modules.push({
                    name,
                    filePath,
                    imports,
                    declarations,
                    exports,
                    lazy: false,
                    role
                });
            }
        }

        // Promote 'global' modules: any 'shared' imported directly by the root module
        const rootMod = this._modules.find(m => m.role === 'root');
        if (rootMod) {
            for (const imp of rootMod.imports) {
                const child = this._modules.find(m => m.name === imp);
                if (child?.role === 'shared') {
                    child.role = 'global';
                    logger.info("[ModuleRegistryBuilder] Promoted %s → global", child.name);
                }
            }
        }

        logger.info("[ModuleRegistryBuilder] Module discovery complete: %d modules", this._modules.length);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Phase 2 — Route↔Module Wiring & Lazy Flags
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Annotates routes with their declaring module name and marks lazy modules.
    *
    * Rules:
    *  • If `r.component` is set → find ModuleInfo where `declarations` includes it → set `r.module`
    *  • If `r.loadChildren` is set → extract module class from `.then(m => m.XxxModule)` → set `r.module` and mark ModuleInfo.lazy=true
    *
    * @param compRouteMap ComponentRouteMap whose `.routeMap.routes` will be annotated.
    * @modifies compRouteMap.routeMap.routes[*].module
    * @modifies internal ModuleInfo[].lazy flags
    */
    assignRoutesToModules(compRouteMap: ComponentRouteMap) {
        const modules = this._modules;

        for (const r of compRouteMap.routeMap.routes) {
            // Eager component route → look up declaring module by declarations[]
            if (r.component) {
                const m = modules.find(m => m.declarations.includes(r.component!));
                if (m) {
                    r.module = m.name;
                    logger.debug("[ModuleRegistryBuilder] %s → eager module %s", r.route, m.name);
                }
            }

            // Lazy module route → parse .then(m => m.SomeModule)
            if (r.loadChildren) {
                const match = /\.then\(\s*\w+\s*=>\s*\w+\.(\w+)\)/.exec(r.loadChildren);
                if (match) {
                    const mName = match[1];
                    const m = modules.find(m => m.name === mName);
                    if (m) {
                        r.module = match[1];
                        m.lazy = true;
                        logger.debug("[ModuleRegistryBuilder] %s → lazy module %s", r.route, mName);
                    }
                }
            }
        }

        logger.info("[ModuleRegistryBuilder] Route→module assignment done");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Heuristics — External Module Detection
    // ────────────────────────────────────────────────────────────────────────────

    /**
    * Determines whether an NgModule is “external”.
    *
    * Definition:
    *  • Declares nothing (declarations.length === 0)
    *  • Has ≥1 entry in `imports`
    *  • Every imported symbol is brought from a non-relative module specifier
    *    (i.e., NOT starting with "." or "/")
    *
    * @param sourceFile   The module's SourceFile (to inspect import statements).
    * @param imports      Symbols listed under the NgModule's `imports: []`.
    * @param declarations Symbols listed under `declarations: []`.
    * @returns true if the module is purely external; otherwise false.
    */
    private _isExternalModule(sourceFile: SourceFile, imports: string[], declarations: string[]) {
        if (declarations.length > 0 || imports.length === 0)
            return false;

        // All import declarations within the file
        const allImportDecls = sourceFile.getImportDeclarations();

        // Keep only symbols whose import declaration points to a non-relative specifier
        const externalImports = imports.filter(modName => {
            // Find the TS import that introduced this symbol
            const decl = allImportDecls.find(d =>
                d.getNamedImports().some(n => n.getName() === modName)
            );
            if (!decl)
                // If we cannot resolve the import, treat as local/unknown (not external)
                return false;

            const spec = decl.getModuleSpecifierValue();
            return !spec.startsWith('.') && !spec.startsWith('/');
        });

        return externalImports.length === imports.length;
    }
}