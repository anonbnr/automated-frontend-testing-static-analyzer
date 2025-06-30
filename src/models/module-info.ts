// ──────────────────────────────────────────────────────────────────────────────
// models/module-info.ts
//
// Contains types for NgModules and their registry:
//   - ModuleRole       (classification of each module’s role in the app)
//   - ModuleInfo       (metadata about an @NgModule)
//   - ModuleRegistry   (collection of all ModuleInfo in the project)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Classification of an NgModule’s role in the application graph.
 *
 * - `root`       — the AppModule
 * - `routing`    — a module that imports RouterModule.forRoot/forChild
 * - `external`   — Angular or third-party modules (BrowserModule, CommonModule, etc.)
 * - `global`     — non-routing modules imported (or lazy-loaded) directly in AppModule
 * - `shared`     — modules imported (or lazy-loaded) by any non-AppModule
 */
export type ModuleRole
    = 'root'
    | 'routing'
    | 'external'
    | 'global'
    | 'shared';

/**
 * Static information about an NgModule in an Angular project.
 */
export interface ModuleInfo {
    /** The class name of the module (e.g. `"PostsModule"`). */
    name: string;

    /** Absolute path to the file containing this module. */
    filePath: string;

    /** Names of NgModule classes imported by this module (static or via lazy). */
    imports: string[];

    /** Class names (components/directives/pipes) declared in this module. */
    declarations: string[];

    /** Class names (components/directives/pipes) that this module re-exports. */
    exports: string[];

    /** True if this module is ever lazy-loaded via a `loadChildren` route. */
    lazy: boolean;

    /** The role this module plays in the navigation graph. */
    role: ModuleRole;
}

/**
 * Registry of all modules discovered in an Angular project.
 */
export class ModuleRegistry {
    private _modules: ModuleInfo[];

    /**
     * @param modules All ModuleInfo objects for every @NgModule in the application.
     */
    constructor(modules: ModuleInfo[]) {
        this._modules = modules;
    }

    /** All modules in this registry. */
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
        return this.modules.find(m => m.name === name);
    }
}