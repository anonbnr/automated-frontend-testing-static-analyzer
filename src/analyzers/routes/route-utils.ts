// ──────────────────────────────────────────────────────────────────────────────
// analyzers/routes/route-utils.ts
//
// Static utility functions for Angular **route analysis**.
//
// Responsibilities:
//   1) Selector ↔ ClassName mapping & lookup
//   2) Routing-file detection
//   3) Route aggregation
//        - collectAllRoutes(project, seenFiles)
//        - analyzeFile(project, sf, seenFiles)
//        - processRoutes(project, sf, seenFiles, elements, routeMap, parentPath?)
//        - recurseLazyModule(project, sf, seenFiles, loadChildrenText, fullPath, routeMap)
//   4) Deduplication & normalization (dedupe, normalize)
//   5) Usage counting & ComponentRouteMap construction
//
// Notes
//   • Paths discovered during scanning may be hierarchical (built from parentPath + child path).
//   • `normalize()` is provided to standardize all route/redirect paths to leading “/”.
//   • This module is purely static: it does **not** execute or require Angular runtime.
//   • Logging is intentionally verbose to aid traceability during analysis.
// ──────────────────────────────────────────────────────────────────────────────

import { dirname, join } from "path";
import { Expression, ObjectLiteralExpression, Project, SourceFile, SyntaxKind } from "ts-morph";
import logger from "../../logging/logger.js";
import { ComponentInfo, ComponentRegistry } from "../../models/component-info.js";
import { ComponentRoute, ComponentRouteMap, ComponentRouteRole, RedirectRoute, RouteMap } from "../../models/route-info.js";
import { AstUtils } from "../../parsers/ast-utils.js";

/**
 * Utility methods for **route-related** operations in an Angular workspace.
 *
 * Public surface:
 *  - getRouteFromSelector(selector, routeMap)
 *  - getRoutesFromSelector(selector, routeMap)
 *  - findParentComponents(selector, componentMap)
 *  - findParentRoutes(component, componentMap, routeMap)
 *  - isRoutingFile(sf)
 *  - collectAllRoutes(project, seenFiles)
 *  - analyzeFile(project, sf, seenFiles)
 *  - processRoutes(project, sf, seenFiles, elements, routeMap, parentPath?)
 *  - recurseLazyModule(project, sf, seenFiles, loadChildrenText, fullPath, routeMap)
 *  - dedupe(raw)
 *  - normalize(raw)
 *  - countReachableUsage(routes, registry, rootSelector?)
 *  - buildComponentRouteMap(registry, routeMap, usage, rootSelector?)
 *  - canonicalizeToKnownRoute(target, knownRoutes)
 */
export class RoutingUtils {
    // ──────────────── Selector ↔ ClassName & lookup ──────────────────

    /**
     * Returns the **first** route path that renders the component identified by `selector`.
     *
     * @param selector Kebab-case component selector (e.g., "app-header").
     * @param routeMap The raw RouteMap to search.
     * @returns First matching route path (no leading slash) or `undefined` if none.
     */
    static getRouteFromSelector(selector: string, routeMap: RouteMap): string | undefined {
        // Convert kebab-case selector to PascalCase class name
        const className = AstUtils.convertSelectorToClassName(selector);

        // Find the first route entry whose `component` matches the className
        return routeMap.routes.find((cmpRoute) => cmpRoute.component === className)?.route;
    }

    /**
     * Returns **all** route paths that render the component identified by `selector`.
     *
     * @param selector Kebab-case component selector.
     * @param routeMap The RouteMap to search.
     * @returns Array of route paths (no leading slash). Empty if none.
     */
    static getRoutesFromSelector(
        selector: string,
        routeMap: RouteMap
    ): string[] {
        const className = AstUtils.convertSelectorToClassName(selector);
        return routeMap.routes
            .filter(r => r.component === className)
            .map(r => r.route);
    }

    /**
     * Finds selectors of components whose `nestedComponents` include `selector`.
     *
     * @param selector     Child component selector (kebab-case).
     * @param componentMap All discovered ComponentInfo entries.
     * @returns Array of **parent** component selectors that include `selector` in their templates.
     */
    static findParentComponents(selector: string, componentMap: ComponentInfo[]): string[] {
        return componentMap
            .filter(c => c.nestedComponents.includes(selector))
            .map(c => c.selector);
    }

    /**
     * Recursively discovers **parent route paths** for a component by walking up
     * its containment chain (via nested component relations).
     *
     * Behavior:
     *  - If a direct route exists for a parent component, returns that route (with leading "/").
     *  - Otherwise, continues recursively up the chain until direct route(s) are found.
     *  - Returns a de-duplicated list.
     *
     * @param component     The child ComponentInfo.
     * @param componentMap  All ComponentInfo entries.
     * @param routeMap      Application RouteMap (raw, possibly unnormalized).
     * @returns Unique array of parent route paths **with leading slash**.
     */
    static findParentRoutes(
        component: ComponentInfo,
        componentMap: ComponentInfo[],
        routeMap: RouteMap
    ): string[] {
        // Find selectors of components that declare `component.selector` in their template
        const parents = this.findParentComponents(component.selector, componentMap);
        const parentRoutes: string[] = [];

        for (const parentSel of parents) {
            // Attempt to retrieve the route path for the parent component
            const route = RoutingUtils.getRouteFromSelector(parentSel, routeMap);

            if (route) {
                // Direct route found → prefix “/” for absolute style
                parentRoutes.push(`/${route}`);
            }
            else {
                // Otherwise, recurse further up
                const parentComp = componentMap.find((c) => c.selector === parentSel);
                if (parentComp)
                    parentRoutes.push(
                        ...this.findParentRoutes(parentComp, componentMap, routeMap)
                    );
            }
        }

        // Deduplicate via Set
        return [...new Set(parentRoutes)];
    }

    // ──────────────── Routing-file detection ──────────────────

    /**
     * Heuristically checks if a .ts file is a **routing** file.
     *
     * Current rule:
     *  - File ends with ".ts" **and**
     *  - It imports `@angular/router`
     *
     * @param sf SourceFile to inspect.
     * @returns `true` if routing-related; otherwise `false`.
     */
    static isRoutingFile(sf: SourceFile) {
        if (!sf.getFilePath().endsWith(".ts"))
            return false;

        return sf
            .getImportDeclarations()
            .some(i => i.getModuleSpecifierValue() === "@angular/router");
    }

    // ──────────────── Route aggregation ──────────────────

    /**
     * Walks **all** routing files in the project and builds a raw RouteMap.
     *
     * Scans:
     *  - `const X: Routes = [ ... ]`
     *  - `RouterModule.forRoot([...])` / `RouterModule.forChild([...])`
     *  - Recurses into lazy-loaded modules discovered via `loadChildren`.
     *
     * Side effects:
     *  - Updates `seenFiles` to avoid re-processing the same file or cycles.
     *
     * @param project   ts-morph Project.
     * @param seenFiles Set of processed file paths (external, caller-owned).
     * @returns Raw RouteMap: `{ routes: ComponentRoute[], redirections: RedirectRoute[] }`
     */
    static async collectAllRoutes(project: Project, seenFiles: Set<string>): Promise<RouteMap> {
        logger.info('[RoutingUtils] Scanning for routing files…');
        logger.debug(
            `[RoutingUtils] Project has ${project.getSourceFiles().length} source files`
        );

        const routes: ComponentRoute[] = [];
        const redirections: RedirectRoute[] = [];

        for (const sf of project.getSourceFiles()) {
            const filePath = sf.getFilePath();
            if (!this.isRoutingFile(sf)) {
                logger.log('trace', `[RoutingUtils] Skipping non-router file: ${filePath}`);
                continue;
            }

            if (seenFiles.has(filePath)) {
                logger.log('trace', `[RoutingUtils] Already processed: ${filePath}`);
                continue;
            }

            logger.info(`[RoutingUtils] Analyzing routing file: %o`, filePath);
            const { routes: r, redirections: rd } =
                await this.analyzeFile(project, sf, seenFiles);
            routes.push(...r);
            redirections.push(...rd);
        }

        logger.info(
            `[RoutingUtils] Finished scanning: ${routes.length} routes, ${redirections.length} redirects`
        );

        return { routes, redirections };
    }

    /**
     * Extracts a RouteMap from a **single** routing file.
     *
     * Recognized patterns (within the file):
     *  - `const X: Routes = [ … ]`
     *  - `RouterModule.forRoot([...])` and `RouterModule.forChild([...])`
     *  - References to named arrays (e.g., `RouterModule.forRoot(routes)`), resolved locally
     *
     * @param project   ts-morph Project.
     * @param sf        Routing SourceFile to analyze.
     * @param seenFiles Set of already visited file paths (for lazy recursion).
     * @returns RouteMap discovered within this file (no normalization yet).
     */
    static async analyzeFile(project: Project, sf: SourceFile, seenFiles: Set<string>): Promise<RouteMap> {
        const filePath = sf.getFilePath();
        logger.info(`[RoutingUtils] Parsing routes in file: ${filePath}`);

        const map: RouteMap = { routes: [], redirections: [] };

        // A) Top-level `const X: Routes = [ … ]`
        for (const vd of sf.getVariableDeclarations()) {
            const typeNode = vd.getTypeNode()?.getText();
            const init = vd.getInitializer();
            if (typeNode === 'Routes' && init?.isKind(SyntaxKind.ArrayLiteralExpression)) {
                logger.log('trace', `[RoutingUtils] Found Routes const: ${vd.getName()}`);
                await this.processRoutes(project, sf, seenFiles, init.getElements(), map);
            }
        }

        // B) RouterModule.forRoot(...) and .forChild(...)
        for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
            const expr = call.getExpression();
            if (!expr.isKind(SyntaxKind.PropertyAccessExpression)
                || expr.getExpression().getText() !== 'RouterModule')
                continue;

            const fn = expr.getName();
            if (fn !== "forRoot" && fn !== "forChild")
                continue;

            logger.log('trace', `[RoutingUtils] Found RouterModule.${fn} call`);

            const arg = call.getArguments()[0];
            if (arg?.isKind(SyntaxKind.ArrayLiteralExpression))
                // Inline array literal
                await this.processRoutes(project, sf, seenFiles, arg.getElements(), map);
            else if (arg?.isKind(SyntaxKind.Identifier)) {
                // Resolve named const within the same file
                const name = arg.getText();
                const decl = sf.getVariableDeclaration(name);
                const arr = decl?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression);
                if (arr) {
                    logger.log(
                        'trace',
                        `[RoutingUtils] Resolving identifier "${name}" to array literal`
                    );
                    await this.processRoutes(project, sf, seenFiles, arr.getElements(), map);
                }
            }
        }

        return map;
    }

    /**
     * Processes each object literal inside a `Routes` array and accumulates:
     *  - component/lazy/lazy-component entries into `routeMap.routes`
     *  - redirects into `routeMap.redirections`
     *  - nested `children` arrays (recursively)
     *  - lazy modules (via `recurseLazyModule`)
     *
     * Path semantics:
     *  - `parentPath` is a **segment** prefix (no leading slash).
     *  - `fullPath` is constructed using `parentPath + "/" + rawPath`, compacted to single slashes.
     *
     * @param project     ts-morph Project.
     * @param sf          Current routing SourceFile.
     * @param seenFiles   Set of visited files to prevent cycles.
     * @param elements    The array elements inside `Routes` (expressions).
     * @param routeMap    Accumulator for routes & redirects (mutated in-place).
     * @param parentPath  Current parent segment (default: "").
     */
    static async processRoutes(
        project: Project,
        sf: SourceFile,
        seenFiles: Set<string>,
        elements: Expression[],
        routeMap: RouteMap,
        parentPath: string = ""
    ): Promise<void> {
        for (const element of elements) {
            // Only consider object literals like { path: '...', component: X, children: [ … ] }.
            if (!element.isKind(SyntaxKind.ObjectLiteralExpression))
                continue;

            const objLit = element as ObjectLiteralExpression;

            // Skip if no `path` property is declared on this object.
            if (!AstUtils.hasProp(objLit, "path"))
                continue;

            // 1) path → build hierarchical path with parent prefix
            const rawPath = AstUtils.getPropAsText(objLit, "path") ?? ""; // e.g. "", "users/:id"
            const combined = [parentPath, rawPath]
                .filter(Boolean)
                .join('/')
                .replace(/\/+/g, '/');

            const fullPath = combined; // e.g. 'admin/users/:id'

            logger.log('trace', `[RoutingUtils] Processing route object for path: "${fullPath}"`);

            // 2) pathMatch (e.g. { path: '', redirectTo: 'home', pathMatch: 'full' })
            const pathMatch = AstUtils.getPropAsText(objLit, "pathMatch") as "full" | "prefix" | undefined;

            // 3a) Eager component (component: DashboardComponent)
            const componentName = AstUtils.getPropAsText(objLit, "component");

            // 3b) Lazy module (loadChildren: () => import('…').then(m => m.SomeModule))
            const loadChildrenText = AstUtils.getPropAsText(objLit, "loadChildren");

            // 3c) Lazy standalone component (loadComponent: () => import('…').then(m => m.SomeComponent))
            const loadComponentText = AstUtils.getPropAsText(objLit, "loadComponent");

            // 4) Guards / resolvers / data (collected as strings)
            const canActivate = AstUtils.getPropAsStringArray(objLit, "canActivate");
            const canLoad = AstUtils.getPropAsStringArray(objLit, "canLoad");
            const canActivateChild = AstUtils.getPropAsStringArray(objLit, "canActivateChild");
            const resolveMap = AstUtils.getPropAsObjectLiteral(objLit, "resolve");
            const dataMap = AstUtils.getPropAsObjectLiteral(objLit, "data");

            // 5) Component or lazy route → record it
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
                    logger.info(`[RoutingUtils] "${fullPath}" → component "${componentName}"`);
                }
                if (loadChildrenText) {
                    routeEntry.loadChildren = loadChildrenText;
                    logger.info(`[RoutingUtils] "${fullPath}" → lazy-module "${loadChildrenText}"`);

                    // Discover and prefix child routes from the lazy-loaded module
                    await this.recurseLazyModule(project, sf, seenFiles, loadChildrenText, fullPath, routeMap);
                }
                if (loadComponentText) {
                    routeEntry.loadComponent = loadComponentText;
                    // Attempt to infer standalone component class name (best-effort)
                    const match = /\.then\(\s*\w+\s*=>\s*\w+\.(\w+)\)/.exec(loadComponentText);
                    if (match?.[1])
                        routeEntry.component = match[1];

                    logger.info(`[RoutingUtils] "${fullPath}" → lazy-component "${loadComponentText}"`);
                }

                routeMap.routes.push(routeEntry);
            }

            // 6) Redirects (`redirectTo`) → record separately
            const redirectTo = AstUtils.getPropAsText(objLit, "redirectTo") ?? "";
            if (redirectTo) {
                const redirectEntry: RedirectRoute = { route: fullPath, redirectTo, pathMatch };
                routeMap.redirections.push(redirectEntry);
                logger.info(`[RoutingUtils] "${fullPath}" --redirect→ "${redirectTo}"`);
            }

            // 7) Nested children: recursively process with updated parent segment
            const childrenInit = AstUtils.getPropInitializer(objLit, "children");
            if (childrenInit?.isKind(SyntaxKind.ArrayLiteralExpression))
                await this.processRoutes(
                    project,
                    sf,
                    seenFiles,
                    childrenInit.getElements(),
                    routeMap,
                    // Preserve parent path when child path is "", else use the new full path
                    rawPath === "" ? parentPath : fullPath
                );
        }
    }

    /**
     * Loads a lazy-loaded routing module and prefixes all its child routes/redirects
     * with the provided `fullPath` (parent path).
     *
     * Resolution strategy:
     *  - Extract module import path from `loadChildren` expression.
     *  - Look for either `<module>-routing.module.ts` or `<module>.ts` next to the finder file.
     *  - Analyze that file and prefix all discovered routes/redirects.
     *  - Guard with `seenFiles` to avoid cycles.
     *
     * @param project          ts-morph Project.
     * @param sf               The file where `loadChildren` was found.
     * @param seenFiles        Files already processed (to avoid cycles).
     * @param loadChildrenText The `loadChildren` expression (stringified).
     * @param fullPath         Parent route prefix (no leading slash).
     * @param routeMap         Accumulator for child routes & redirections (mutated).
     */
    static async recurseLazyModule(
        project: Project,
        sf: SourceFile,
        seenFiles: Set<string>,
        loadChildrenText: string,
        fullPath: string,
        routeMap: RouteMap
    ) {
        // Extract import path from `import('...')`
        const [, importPath] =
            /import\(['"](.*)['"]\)/.exec(loadChildrenText) || [];
        if (!importPath)
            return;

        logger.debug(
            `[RoutingUtils] Recursing into lazy module for "${fullPath}", import="${loadChildrenText}"`
        );

        // Compute adjacent candidate files
        const dir = dirname(sf.getFilePath());
        const routingFile = join(
            dir,
            importPath.replace(/\.module$/, '') + '-routing.module.ts'
        );
        const moduleFile = join(dir, importPath + '.ts');

        // Prefer a routing file; if not present, try the module file
        const childSf =
            project.getSourceFile(routingFile) ||
            project.getSourceFile(moduleFile);

        logger.info(`[RoutingUtils] looking for %o | %o: %o`, routingFile, moduleFile, !!childSf);
        if (childSf && !seenFiles.has(childSf.getFilePath())) {
            seenFiles.add(childSf.getFilePath());
            const childMap = await this.analyzeFile(project, childSf, seenFiles);

            // Prefix child component routes with parent `fullPath`
            for (const cr of childMap.routes) {
                routeMap.routes.push({
                    ...cr,
                    route:
                        fullPath +
                        (cr.route.startsWith('/') ? '' : '/') +
                        cr.route
                });
            }

            // Prefix redirect "from" and "to" with parent `fullPath`
            for (const rd of childMap.redirections) {
                routeMap.redirections.push({
                    route:
                        fullPath +
                        (rd.route.startsWith('/') ? '' : '/') +
                        rd.route,
                    redirectTo:
                        fullPath +
                        (rd.redirectTo.startsWith('/')
                            ? ''
                            : '/') +
                        rd.redirectTo,
                    pathMatch: rd.pathMatch
                });
            }
        }
    }

    // ──────────────── Deduplication & normalization ──────────────────

    /**
     * Deduplicates routes & redirects in a RouteMap, **merging metadata** for duplicate paths.
     *
     * Merge policy for duplicate component routes:
     *  - Prefer existing values; fill missing fields from the new route.
     *  - Array fields (`canActivate`, `canLoad`, `canActivateChild`) are unioned (unique).
     *  - Map fields (`resolve`, `data`) are shallow-merged (last wins per key).
     *
     * Redirects:
     *  - Deduplicated by `route` path; consolidate `redirectTo`/`pathMatch` if needed.
     *
     * @param raw Raw RouteMap (possibly with duplicates).
     * @returns New RouteMap with unique routes/redirections.
     */
    static dedupe(raw: RouteMap): RouteMap {
        // Helper to merge string arrays uniquely (or keep undefined if both absent)
        const mergeArr = (a?: string[], b?: string[]) =>
            a || b ? Array.from(new Set([...(a || []), ...(b || [])])) : undefined;

        // Deduplicate component routes by `route` string
        const uniqR = new Map<string, ComponentRoute>();
        for (const r of raw.routes) {
            const existing = uniqR.get(r.route);
            if (!existing)
                // clone so we don't modify the original
                uniqR.set(r.route, { ...r });
            else {
                // merge into `existing` (preserve, then fill)
                existing.component ||= r.component;
                existing.loadChildren ||= r.loadChildren;
                existing.loadComponent ||= r.loadComponent;
                existing.pathMatch ||= r.pathMatch;
                existing.canActivate = mergeArr(existing.canActivate, r.canActivate);
                existing.canActivateChild = mergeArr(existing.canActivateChild, r.canActivateChild);
                existing.canLoad = mergeArr(existing.canLoad, r.canLoad);
                existing.resolve = { ...(existing.resolve || {}), ...(r.resolve || {}) };
                existing.data = { ...(existing.data || {}), ...(r.data || {}) };
            }
        }

        // Deduplicate redirects by `route`
        const uniqRD = new Map<string, RedirectRoute>();
        for (const rd of raw.redirections) {
            const existing = uniqRD.get(rd.route);
            if (!existing)
                uniqRD.set(rd.route, rd);
            else {
                existing.redirectTo ||= rd.redirectTo;
                existing.pathMatch ||= rd.pathMatch;
            }
        }

        // Note: If desired, we could ensure that redirect-only paths also exist
        // as empty component routes (left intentionally commented out).
        // See: the commented block in original code for that alternative.

        return {
            routes: Array.from(uniqR.values()),
            redirections: Array.from(uniqRD.values())
        };
    }

    /**
     * Normalizes **all** paths in a RouteMap **in-place** to a canonical form:
     *  - Always starts with “/”
     *  - Never ends with “/” (except for root “/”)
     *
     * This applies to both `routes[].route` and `redirections[].(route|redirectTo)`.
     *
     * @param raw RouteMap to normalize (mutated in-place).
     * @returns The same RouteMap reference for chaining.
     */
    static normalize(raw: RouteMap): RouteMap {
        const norm = (p: string) => {
            // Root: keep as "/"
            if (p === '' || p === '/')
                return '/';

            // Ensure leading slash
            let s = p.startsWith('/') ? p : '/' + p;

            // Strip trailing slash (but never collapse root)
            if (s.length > 1 && s.endsWith('/'))
                s = s.slice(0, -1);

            return s;
        }

        for (const r of raw.routes)
            r.route = norm(r.route);

        for (const rd of raw.redirections) {
            rd.route = norm(rd.route);
            rd.redirectTo = norm(rd.redirectTo);
        }

        return raw;
    }

    // ──────────────── Usage counting & classification ──────────────────

    /**
     * Counts, for each **component class name**, how many distinct routes it appears in,
     * transitively (i.e., via nested component containment starting from each route's
     * directly mapped component, plus the app root component if available).
     *
     * Mechanics:
     *  - Builds a selector-based containment graph from ComponentRegistry (class → child classes).
     *  - For each route with a direct `component`, DFS through its nested components.
     *  - Optionally includes the root component by `rootSelector` (default: "app-root").
     *  - Increments usage **once per route** for each visited component.
     *
     * @param routes       All component routes (typically `routeMap.routes`).
     * @param registry     ComponentRegistry for resolving nested components.
     * @param rootSelector Selector of the root component (default "app-root").
     * @returns Map of `ComponentClassName → usageCount`.
     */
    static countReachableUsage(
        routes: ComponentRoute[],
        registry: ComponentRegistry,
        rootSelector: string = 'app-root'
    ): Map<string, number> {
        // Build adjacency list: componentName → child component class names
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

        // Retrieve the “root” component class name (if present)
        const rootCi = registry.getBySelector(rootSelector);
        const rootName = rootCi?.name;

        // For each route, traverse its direct component + root (if known) and count reachable
        for (const r of routes) {
            if (!r.component)
                continue;

            const seen = new Set<string>();
            const stack = [r.component, ...(rootName ? [rootName] : [])];

            while (stack.length) {
                const curr = stack.pop()!;
                if (seen.has(curr))
                    continue;

                seen.add(curr);

                for (const child of graph.get(curr) || [])
                    stack.push(child);
            }

            // Increment each visited component once per route
            for (const comp of seen)
                usage.set(comp, (usage.get(comp) || 0) + 1);
        }

        return usage;
    }

    /**
     * Groups **all** components into role buckets relative to the route map:
     *  - `root`   : the `<app-root>` host component
     *  - `global` : present (transitively) on **every** route
     *  - `shared` : present on >1 but <all routes
     *  - `mapped` : directly mapped to exactly one route
     *  - `dead`   : not reachable on any route
     *
     * Details:
     *  - Root classification uses `rootSelector` (default "app-root").
     *  - “Mapped” requires count==1 **and** being directly mapped on a route;
     *    otherwise (count==1 via nesting) → “shared”.
     *
     * @param registry     Full ComponentRegistry snapshot.
     * @param routeMap     A (typically normalized) RouteMap.
     * @param usage        Precomputed usage counts (from countReachableUsage).
     * @param rootSelector Selector for the root component (default "app-root").
     * @returns ComponentRouteMap with `roles` filled and original `routeMap` attached.
     */
    static buildComponentRouteMap(
        registry: ComponentRegistry,
        routeMap: RouteMap,
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

        // Identify AppComponent by selector (if present)
        const rootComp = registry.getBySelector(rootSelector);
        if (rootComp)
            roles.root.push(rootComp);


        // Precompute set of directly mapped component names
        const totalRoutes = routeMap.routes.length;
        const directlyMapped = new Set(
            routeMap.routes
                .filter(r => !!r.component)
                .map(r => r.component!)
        );

        for (const ci of registry.components) {
            // Skip the root entry if already classified
            if (rootComp && ci.name === rootComp.name)
                continue;

            const count = usage.get(ci.name) ?? 0;

            if (count === 0)
                roles.dead.push(ci);
            else if (count === totalRoutes)
                roles.global.push(ci);
            else if (count > 1)
                roles.shared.push(ci);
            else /* count === 1 */ {
                // If directly mapped on a route → “mapped”, else “shared” (via nesting on exactly one route)
                if (directlyMapped.has(ci.name))
                    roles.mapped.push(ci);
                else
                    roles.shared.push(ci);
            }
        }

        return {
            routeMap,
            roles,
        };
    }

    /**
     * Maps an arbitrary route-like target (possibly with concrete params) to a
     * canonical known route template when possible.
     *
     * Matching rule:
     *  - Compare segment counts; allow param segments (":id") to match any value.
     *  - Return the **known** canonical route if all static segments match.
     *  - Otherwise, return the original target unchanged.
     *
     * Examples:
     *  - target: "/users/42" with known "/users/:id" → returns "/users/:id"
     *  - target: "/admin/logs" with known "/admin/:section" → returns "/admin/:section"
     *
     * @param target      Concrete or template path (with or without leading "/").
     * @param knownRoutes Set of canonical known routes (usually already normalized).
     * @returns Canonical template path if matched; else the original `target`.
     */
    static canonicalizeToKnownRoute(target: string, knownRoutes: Set<string>): string {
        if (knownRoutes.has(target)) return target;
        const tSegs = target.replace(/^\/+/, '').split('/');
        for (const kr of knownRoutes) {
            const rSegs = kr.replace(/^\/+/, '').split('/');
            if (rSegs.length !== tSegs.length) continue;
            let ok = true;
            for (let i = 0; i < rSegs.length; i++) {
                const rs = rSegs[i], ts = tSegs[i];
                if (rs.startsWith(':')) continue;     // param matches anything
                if (rs !== ts) { ok = false; break; } // static segment must match
            }
            if (ok) return kr; // map to the canonical template
        }
        return target; // no match; leave as-is
    }
}