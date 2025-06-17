// ──────────────────────────────────────────────────────────────────────────────
// route-analyzer.ts
//
// Discovers, deduplicates and classifies all application routes **and**
// computes transitively‐reachable component usage so we can tag each
// component as root, global, shared, mapped, or dead.
// ──────────────────────────────────────────────────────────────────────────────

import { Expression, ObjectLiteralExpression, Project, SourceFile, SyntaxKind } from 'ts-morph';
import { ComponentInfo, ComponentRegistry } from '../../models/component-info.js';
import { ComponentRoute, ComponentRouteMap, ComponentRouteRole, RedirectRoute, RouteMap } from '../../models/route-info.js';
import { RoutingUtils } from './route-utils.js';

/**
 * Scans an Angular workspace to build:
 *  1) A deduplicated `RouteMap`
 *  2) Classification of every component into { dead, mapped, shared, global }
 */
export class RouteAnalyzer {
    private project: Project;

    /**
     * Initializes the RouteAnalyzer with the project to analyze
     * @param project - The ts-morph Project to analyze
     */
    constructor(project: Project) {
        this.project = project;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 1) PUBLIC API
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Discovers all routes across `.ts` files, dedupes them, counts component usage,
     * and then classifies components into `dead`, `mapped`, `shared`, and `global`.
     *
     * @param registry Prebuilt `ComponentRegistry` (all components + templates).
     * @returns A `ComponentRouteMap` with the raw `RouteMap` plus 4 classification sets.
     */
    async analyzeProject(
        registry: ComponentRegistry
    ): Promise<ComponentRouteMap> {
        // 1) collect, dedupe, and normalize routes
        const rawMap = await this._collectAllRoutes();
        const deduped = this._dedupe(rawMap);
        const normalized = this._normalize(deduped);

        // 2) build reachability-based usage
        const reachUsage = this._countReachableUsage(normalized.routes, registry);

        // 3) classify into roles
        return this._buildComponentRouteMap(registry, normalized, reachUsage);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 2) ROUTE DISCOVERY & PROCESSING
    // ────────────────────────────────────────────────────────────────────────────
    /**
     * Finds every `.ts` file that imports `@angular/router` or declares a `Routes` array.
     * @param sf A SourceFile of the Angular project to examine
     * @returns true if the source file imports/declares a Routes array, false otherwise
     */
    private _isRoutingFile(sf: SourceFile) {
        const path = sf.getFilePath();
        if (!path.endsWith('.ts'))
            return false;
        if (sf.getImportDeclarations()
            .some(i => i.getModuleSpecifierValue() === '@angular/router'))
            return true;
        return false;
    }

    /**
     * Aggregates every route + redirect from all routing files.
     * @returns The raw RouteMap of the project before deduplication
     */
    private async _collectAllRoutes(): Promise<RouteMap> {
        const routes: ComponentRoute[] = [];
        const redirections: RedirectRoute[] = [];

        for (const sf of this.project.getSourceFiles()) {
            if (!this._isRoutingFile(sf))
                continue;
            const fileMap = await this._analyzeFile(sf);
            routes.push(...fileMap.routes);
            redirections.push(...fileMap.redirections);
        }
        return { routes, redirections };
    }

    /**
     * Reads a single file’s `const X = [ … ]` route declarations and extracts
     * all `ComponentRoute` and `RedirectRoute`.
     * 
     * @param sf The Source file to analyze
     * @returns The raw RouteMap of the file
     */
    private async _analyzeFile(sf: SourceFile): Promise<RouteMap> {
        const map: RouteMap = { routes: [], redirections: [] };

        // A) pick up const X: Routes = [ … ]
        for (const vd of sf.getVariableDeclarations()) {
            const typeNode = vd.getTypeNode()?.getText();
            const init = vd.getInitializer();
            if (typeNode === 'Routes' && init?.isKind(SyntaxKind.ArrayLiteralExpression))
                await this._processRoutes(init.getElements(), map, ''); // top‐level
        }

        // B) pick up RouterModule.forRoot(...) and .forChild(...)
        for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
            const expr = call.getExpression();
            if (!expr.isKind(SyntaxKind.PropertyAccessExpression))
                continue;

            if (expr.getExpression().getText() !== 'RouterModule')
                continue;

            const fn = expr.getName();
            if (fn !== "forRoot" && fn !== "forChild")
                continue;

            const arg = call.getArguments()[0];
            if (arg?.isKind(SyntaxKind.ArrayLiteralExpression))
                await this._processRoutes(arg.getElements(), map, ""); // top‐level
            else if (arg?.isKind(SyntaxKind.Identifier)) {
                // resolve const X:
                const name = arg.getText();
                const decl = sf.getVariableDeclaration(name);
                const arr = decl?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression);
                if (arr)
                    await this._processRoutes(arr.getElements(), map, ''); // top‐level
            }
        }

        return map;
    }

    /**
     * Recursively walks each `ObjectLiteralExpression` in a Routes[] array.
     * - Extracts path + optional pathMatch
     * - Extracts eager‐load (component), or lazy‐load (loadChildren / loadComponent)
     * - Extracts guards (canActivate, canLoad, canActivateChild), resolvers (resolve), data
     * - Extracts redirectTo + optional pathMatch
     * - Recurses into `children: [...]` for nested routes.
     *
     * @param elements   - A list of AST `Expression` nodes representing each route entry.
     * @param routeMap   - The `RouteMap` being built in-place.
     * @param parentPath - Accumulated parent path (e.g. 'admin/users').
     */
    private async _processRoutes(
        elements: Expression[],
        routeMap: RouteMap,
        parentPath: string = ""
    ): Promise<void> {
        for (const element of elements) {
            // Only consider objects like { path: '...', component: X, children: [ … ] }.
            if (!element.isKind(SyntaxKind.ObjectLiteralExpression))
                continue;

            const objLit = element as ObjectLiteralExpression;

            // Skip if no `path` property is declared on this object.
            if (!RoutingUtils.hasProp(objLit, "path"))
                continue;

            // 1) path
            const rawPath = RoutingUtils.getPropAsText(objLit, "path") || ""; // e.g. "", "users/:id"
            let fullPath = rawPath;
            if (parentPath)
                fullPath = rawPath ? `${parentPath}/${rawPath}` : parentPath;

            // 2) pathMatch (e.g. { path: '', redirectTo: 'home', pathMatch: 'full' })
            const pathMatch = RoutingUtils.getPropAsText(objLit, "pathMatch") as "full" | "prefix" | undefined;

            // 3a) Eager‐loaded component? (component: DashboardComponent)
            const componentName = RoutingUtils.getPropAsText(objLit, "component");

            // 3b) Lazy‐loaded module? (loadChildren: () => import('…').then(m => m.SomeModule))
            const loadChildrenText = RoutingUtils.getPropAsText(objLit, "loadChildren");

            // 3c) Lazy‐loaded component? (loadComponent: () => import('…').then(m => m.SomeComponent))
            const loadComponentText = RoutingUtils.getPropAsText(objLit, "loadComponent");

            // 4) guards + resolvers + data
            const canActivate = RoutingUtils.getPropAsStringArray(objLit, "canActivate");
            const canLoad = RoutingUtils.getPropAsStringArray(objLit, "canLoad");
            const canActivateChild = RoutingUtils.getPropAsStringArray(objLit, "canActivateChild");
            const resolveMap = RoutingUtils.getPropAsObjectLiteral(objLit, "resolve");
            const dataMap = RoutingUtils.getPropAsObjectLiteral(objLit, "data");

            // 5) If it's a component/lazy route, record it
            if (componentName || loadChildrenText || loadComponentText) {
                const routeEntry: ComponentRoute = {
                    route: fullPath,
                    pathMatch,
                    canActivate: canActivate.length ? canActivate : undefined,
                    canActivateChild: canActivateChild.length ? canActivateChild : undefined,
                    canLoad: canLoad.length ? canLoad : undefined,
                    resolve: Object.keys(resolveMap).length ? resolveMap : undefined,
                    data: Object.keys(dataMap).length ? dataMap : undefined
                };

                if (componentName) {
                    routeEntry.component = componentName;
                    console.log(`[RouteAnalyzer] "${fullPath}" → component "${componentName}"`);
                }
                if (loadChildrenText) {
                    routeEntry.loadChildren = loadChildrenText;
                    console.log(`[RouteAnalyzer] "${fullPath}" → lazy-module "${loadChildrenText}"`);

                    // extract the module path string:
                    const [, modulePath] = /import\(['"](.*)['"]\)/.exec(loadChildrenText) || [];
                    if (modulePath) {
                        // resolve e.g. "./owners/owners.module"
                        const mf = this.project.getSourceFile(modulePath + '.routing.ts')
                            ?? this.project.getSourceFile(modulePath + '.module.ts');
                        if (mf) {
                            // find its RouterModule.forChild(...) just like above
                            const childMap = await this._analyzeFile(mf);
                            routeMap.routes.push(...childMap.routes);
                            routeMap.redirections.push(...childMap.redirections);
                        }
                    }
                }
                if (loadComponentText) {
                    routeEntry.loadComponent = loadComponentText;
                    console.log(`[RouteAnalyzer] "${fullPath}" → lazy-component "${loadComponentText}"`);
                }

                routeMap.routes.push(routeEntry);
            }

            // 6) If `redirectTo` is defined, record it (with pathMatch if present):
            const redirectTo = RoutingUtils.getPropAsText(objLit, "redirectTo") || "";
            if (redirectTo) {
                const redirectEntry: RedirectRoute = { route: fullPath, redirectTo };

                if (pathMatch)
                    redirectEntry.pathMatch = pathMatch;

                routeMap.redirections.push(redirectEntry);
                console.log(`[RouteAnalyzer] "${fullPath}" --redirect→ "${redirectTo}" (pathMatch:${pathMatch})`);
            }

            // 7) If `children: [ … ]` exists, recursively process nested routes
            if (RoutingUtils.hasProp(objLit, "children")) {
                const childrenInit = RoutingUtils.getPropInitializer(objLit, "children");
                if (childrenInit && childrenInit.isKind(SyntaxKind.ArrayLiteralExpression))
                    await this._processRoutes(
                        childrenInit.getElements(),
                        routeMap,
                        rawPath === "" ? parentPath : fullPath
                    );
            }
        }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 3) DEDUPE & USAGE COUNT
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Removes duplicate routes & redirects, keeping the first by path.
     * @param raw  The raw RouteMap to dedupe
     * @returns a deduped RouteMap
     */
    private _dedupe(raw: RouteMap): RouteMap {
        const uniqRoutes = new Map<string, ComponentRoute>();
        for (const r of raw.routes)
            if (!uniqRoutes.has(r.route))
                uniqRoutes.set(r.route, r);

        const uniqRedirs = new Map<string, RedirectRoute>();
        for (const rd of raw.redirections)
            if (!uniqRedirs.has(rd.route))
                uniqRedirs.set(rd.route, rd);

        return {
            routes: Array.from(uniqRoutes.values()),
            redirections: Array.from(uniqRedirs.values())
        };
    }

    /**
     * Normalizes all routes in the RouteMap, making sure they all start with "/"
     * @param raw  The raw RouteMap to normalize
     * @returns a normalized RouteMap
     */
    private _normalize(raw: RouteMap): RouteMap {
        const normalize = (p: string) => {
            if (p === "")
                return "/";
            return p.startsWith("/") ? p : `/${p}`;
        }

        raw.routes.forEach(r => r.route = normalize(r.route));
        raw.redirections.forEach(rd => {
            rd.route = normalize(rd.route);
            rd.redirectTo = normalize(rd.redirectTo);
        });

        return raw;
    }

    /**
     * Build a map of component-class name → number of distinct routes for which
     * it (transitively) appears. We start from each top-level route’s component
     * *and* the root component, then DFS through its nestedComponents graph.
     */
    private _countReachableUsage(
        routes: ComponentRoute[],
        registry: ComponentRegistry,
        rootSelector: string = 'app-root'
    ): Map<string, number> {
        // build adjacency list: componentName → child component class names
        const graph = new Map<string, string[]>();
        for (const ci of registry.components) {
            graph.set(
                ci.name,
                ci.nestedComponents
                    .map(sel => registry.getBySelector(sel))
                    .filter(Boolean)
                    .map(c => c!.name)
            );
        }

        const usage = new Map<string, number>();

        // retrieve the “root” component class name
        const rootCi = registry.getBySelector(rootSelector);
        const rootName = rootCi?.name;

        for (const r of routes) {
            if (!r.component)
                continue;
            const seen = new Set<string>();
            const stack = [r.component];

            if (rootName)
                stack.push(rootName);

            while (stack.length) {
                const curr = stack.pop()!;
                if (seen.has(curr))
                    continue;
                seen.add(curr);

                for (const child of graph.get(curr) || [])
                    stack.push(child);
            }

            // increment once per route
            for (const comp of seen)
                usage.set(comp, (usage.get(comp) || 0) + 1);
        }

        return usage;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 4) COMPONENT CLASSIFICATION
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Assigns every ComponentInfo into one of:
     *  - root   — the single <app-root> component
     *  - global — appears on every route (via nesting)
     *  - shared — appears on multiple but not all routes
     *  - mapped — directly tied to exactly one route
     *  - dead   — never used
     */
    private _buildComponentRouteMap(
        registry: ComponentRegistry,
        normalized: RouteMap,
        usage: Map<string, number>,
        rootSelector: string = 'app-root'
    ): ComponentRouteMap {
        const roles: Record<ComponentRouteRole, ComponentInfo[]> = {
            root: [],
            global: [],
            shared: [],
            mapped: [],
            dead: [],
        };

        // find AppComponent by selector
        const rootComp = registry.getBySelector(rootSelector);
        if (rootComp)
            roles.root.push(rootComp);

        const totalRoutes = normalized.routes.length;

        // build a set of *directly* mapped component names
        const directlyMapped = new Set(
            normalized.routes
                .filter(r => !!r.component)
                .map(r => r.component!)
        );

        for (const ci of registry.components) {
            // skip the root entry if already classified
            if (rootComp && ci.name === rootComp.name)
                continue;

            const count = usage.get(ci.name) || 0;

            if (count === 0)
                roles.dead.push(ci);
            else if (count === totalRoutes)
                roles.global.push(ci);
            else if (count > 1)
                roles.shared.push(ci);
            else /* count === 1 */ {
                // if it’s also a top‐level route component, treated as mapped;
                // otherwise it’s “shared” by virtue of nesting in exactly one route
                if (directlyMapped.has(ci.name))
                    roles.mapped.push(ci);
                else
                    roles.shared.push(ci);
            }
        }

        return {
            routeMap: normalized,
            roles,
        };
    }
}