// ──────────────────────────────────────────────────────────────────────────────
// builders/module-registry-builder.ts
//
// Phase 1: Scan every @NgModule and build a partial ModuleInfo list:
//   - imports, declarations, exports, bootstrap
//   - classify roles: root, routing, external, shared, global
//
// Phase 2: Given a ComponentRouteMap, tag:
//   - each module.lazy = true for loadChildren
//   - each route.module = declaring NgModule
//
// Produces a ModuleRegistry for downstream steps.
// ──────────────────────────────────────────────────────────────────────────────

import { Project, SourceFile, SyntaxKind } from "ts-morph";
import logger from "../logging/logger.js";
import { ModuleInfo, ModuleRegistry, ModuleRole } from "../models/module-info.js";
import { ComponentRouteMap } from "../models/route-info.js";
import { AstUtils } from "../parsers/ast-utils.js";

/**
 * Two-phase builder for an NgModule registry:
 *
 * 1. discoverModules():
 *    - walks the Project for every @NgModule
 *    - collects ModuleInfo (lazy=false) and classifies root/routing/external/shared/global
 *
 * 2. assignRoutesToModules():
 *    - marks lazy=true for any loadChildren
 *    - sets route.module for eager and lazy routes
 *
 * Finally exposes `.registry` → ModuleRegistry.
 * 
 * @example
 *  ```ts
 *  const builder = new ModuleRegistryBuilder(project);
 *  await builder.discoverModules();
 *  builder.assignRoutesToModules(compRouteMap);
 *  const registry = builder.registry;
 *  logger.info(registry.modules);
 * ```
 */
export class ModuleRegistryBuilder {
    private _modules: ModuleInfo[] = [];
    private _registry!: ModuleRegistry;

    /**
     * @param project  A ts-morph Project initialized with the Angular tsconfig.
     */
    constructor(private project: Project) { }

    /** After scanning, expose a ModuleRegistry. */
    get registry(): ModuleRegistry {
        if (!this._registry) {
            this._registry = new ModuleRegistry(this._modules);
            logger.debug("[ModuleRegistryBuilder] ModuleRegistry constructed");
        }
        return this._registry;
    }

    /**
     * Phase 1: scan for @NgModule declarations and classify their role.
     *
     * Resets any previously discovered modules.
     *
     * After calling this, use `.registry.modules` to inspect.
     *
     * @returns Promise that resolves once all modules are discovered.
     */
    async discoverModules(): Promise<void> {
        logger.info('[ModuleRegistryBuilder] Starting module discovery');
        this._modules = [];      // reset from previous runs

        // 1) Iterate through every source file in the project
        for (const sf of this.project.getSourceFiles()) {
            // only consider TypeScript files
            if (!sf.getFilePath().endsWith(".ts")) {
                logger.log('trace', "[ModuleRegistryBuilder] Skipping non-TS file %s", sf.getFilePath());
                continue;
            }

            // 2) For each class declaration, check for a `@NgModule` decorator
            for (const cls of sf.getClasses()) {
                const dec = cls
                    .getDecorator('NgModule');

                // Not an Angular module
                if (!dec)
                    continue;

                // Retrieve the object used to parameterize the module
                const objLit = dec.getArguments()[0].asKind(SyntaxKind.ObjectLiteralExpression);
                if (!objLit) {
                    logger.warn(
                        "[ModuleRegistryBuilder] @NgModule decorator has no ObjectLiteral in %s",
                        sf.getFilePath()
                    );
                    continue;
                }

                // Retrieve class name and file path
                const name = cls.getName()!;
                const filePath = sf.getFilePath();

                // Extract arrays from the decorator
                // 1) imports/declarations/exports
                const imports = AstUtils.getPropAsStringArray(objLit, 'imports');
                const declarations = AstUtils.getPropAsStringArray(objLit, 'declarations');
                const exports = AstUtils.getPropAsStringArray(objLit, 'exports');
                const bootstrap = AstUtils.getPropAsStringArray(objLit, 'bootstrap');

                // 2) determine roles (except global which will be determined at the end)
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
                // 3) construct module info and push it into the array of module infos
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

        // 4) identify modules with the role "global"
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

    /**
     * Phase 2: wire up lazy flags and module→route associations.
     *
     * For each route in `compRouteMap.routeMap.routes`:
     *  - If `loadChildren` is present, finds the NgModule name, sets `.lazy = true` on that ModuleInfo, and assigns `route.module`.
     *  - Else if `component` is present, finds the declaring ModuleInfo (by looking at its `declarations`) and assigns `route.module`.
     *
     * @param compRouteMap ComponentRouteMap whose `.routeMap.routes` will be annotated.
     * @modifies compRouteMap.routeMap.routes[*].module
     * @modifies internal ModuleInfo[].lazy flags
     */
    assignRoutesToModules(compRouteMap: ComponentRouteMap) {
        const modules = this._modules;

        for (const r of compRouteMap.routeMap.routes) {
            // 1) eager component: find the module that declared this component
            if (r.component) {
                const m = modules.find(m => m.declarations.includes(r.component!));
                if (m) {
                    r.module = m.name;
                    logger.debug("[ModuleRegistryBuilder] %s → eager module %s", r.route, m.name);
                }
            }

            // 2) lazy modules
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

    /**
     * Determines whether a given NgModule should be classified as “external”.
     *
     * A module is considered external if:
     *   1. It declares no own components/directives/pipes (`declarations` is empty).
     *   2. It has at least one import in its `imports` array.
     *   3. Every imported symbol comes from a non-relative package specifier
     *      (i.e. it only re-exports symbols from third-party or Angular packages).
     *
     * @param sourceFile    The ts-morph SourceFile for this module, used to inspect its import statements.
     * @param imports       The list of symbol names from the NgModule’s `imports` array.
     * @param declarations  The list of symbol names from the NgModule’s `declarations` array.
     * @returns `true` if this module declares nothing and only imports from non-relative packages; otherwise `false`.
     */
    private _isExternalModule(sourceFile: SourceFile, imports: string[], declarations: string[]) {
        if (declarations.length > 0 || imports.length === 0)
            return false;

        // Gather all TS import declarations in this file
        const allImportDecls = sourceFile.getImportDeclarations();

        // Check that every imported symbol comes from an external (non-relative) module
        const externalImports = imports.filter(modName => {
            // find the import that brought in this symbol
            const decl = allImportDecls.find(d =>
                d.getNamedImports().some(n => n.getName() === modName)
            );
            if (!decl)
                // if we can’t find the import, assume it’s local/unknown → not external
                return false;

            const spec = decl.getModuleSpecifierValue();
            return !spec.startsWith('.') && !spec.startsWith('/');
        });

        return externalImports.length === imports.length;
    }
}