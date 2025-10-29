// ──────────────────────────────────────────────────────────────────────────────
// models/module-info.ts
//
// Purpose
//   Types that describe Angular NgModules and a simple registry over them.
//   Consumed by analyzers/builders to reason about project structure and
//   navigation coverage.
//
// Exposed types
//   - ModuleRole     : classification of an NgModule within the application graph
//   - ModuleInfo     : metadata snapshot for a single @NgModule
//   - ModuleRegistry : thin wrapper over a collection of ModuleInfo
//
// Notes
//   • All names in `imports`, `declarations`, and `exports` are class names,
//     not file paths. Use `filePath` to locate the defining source file.
//   • `lazy` is true iff the module is reachable via a `loadChildren` route
//     anywhere in the app (even if it is also imported eagerly elsewhere).
//   • `role` values are intended to be mutually exclusive in this model.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Classification of an NgModule's role in the application graph.
 *
 * Semantics (mutually exclusive in this model):
 * - `root`     — The application's root module (typically `AppModule`).
 * - `routing`  — An NgModule that configures routing (imports `RouterModule.forRoot` or `forChild`).
 * - `external` — Angular platform or third-party modules (e.g., `BrowserModule`, `CommonModule`, library modules).
 * - `global`   — Non-routing modules wired at the application level (imported into the root module).
 * - `shared`   — Modules consumed by feature modules (imported by any non-root module).
 */
export type ModuleRole
    = 'root'
    | 'routing'
    | 'external'
    | 'global'
    | 'shared';

/**
 * Static information about an NgModule in an Angular project.
 *
 * This is a structural snapshot produced by static analysis, not a runtime
 * reflection of the Angular compiler. Fields contain names/paths sufficient
 * to reconstruct module relationships across the codebase.
 */
export interface ModuleInfo {
    /** The class name of the module (e.g. `"PostsModule"`). */
    name: string;

    /**
    * Absolute path to the file that declares this NgModule class.
    * Example: `/workspace/app/posts/posts.module.ts`
    */
    filePath: string;

    /**
    * Class names of NgModules imported by this module (eager or lazy).
    * Example: `['CommonModule', 'PostsRoutingModule', 'SharedModule']`
    *
    * Note: Values are class identifiers, not file paths or specifiers.
    */
    imports: string[];

    /**
    * Class names declared in this NgModule (components/directives/pipes).
    * Example: `['PostsListComponent', 'PostCardComponent']`
    */
    declarations: string[];

    /**
    * Class names re-exported by this NgModule (components/directives/pipes).
    * Consumers importing this module gain access to these symbols.
    */
    exports: string[];

    /**
    * True iff this NgModule is ever lazy-loaded via a `loadChildren` route.
    * If a module can be reached via lazy routes anywhere in the app, this flag
    * should be set even if it is also imported eagerly in other contexts.
    */
    lazy: boolean;

    /**
    * The high-level role this module plays for navigation/structure analysis.
    * See {@link ModuleRole} for semantics.
    */
    role: ModuleRole;
}

/**
 * Registry of all NgModules discovered by static analysis.
 *
 * This class is intentionally minimal: it exposes the list and a name-based
 * lookup that mirrors typical usage in analyzers and builders.
 */
export class ModuleRegistry {
    private _modules: ModuleInfo[];

    /**
    * @param modules All ModuleInfo objects for every @NgModule in the application.
    * The array is assumed to represent a consistent snapshot.
    */
    constructor(modules: ModuleInfo[]) {
        this._modules = modules;
    }

    /** All modules in this registry (as provided to the constructor). */
    get modules() {
        return this._modules;
    }

    /**
    * Look up a module by its class name.
    *
    * @param name The class name of the module (e.g. `"AppModule"`).
    * @returns The matching ModuleInfo, or `undefined` if not found.
    */
    getByName(name: string): ModuleInfo | undefined {
        // Name comparison is case-sensitive to reflect TypeScript identifier rules.
        return this.modules.find(m => m.name === name);
    }
}