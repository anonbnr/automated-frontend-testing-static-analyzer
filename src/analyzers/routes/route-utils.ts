// ──────────────────────────────────────────────────────────────────────────────
// analyzers/routes/route-utils.ts
//
// Static utility functions for Angular route analysis.
//
// Responsibilities:
//   1. Selector ↔ ClassName mapping & lookup
//   2. Routing-file detection
//   3. Route aggregation (collectAllRoutes, analyzeFile, processRoutes, recurseLazyModule)
//   4. Deduplication & normalization (dedupe, normalize)
//   5. Usage counting & ComponentRouteMap construction
// ──────────────────────────────────────────────────────────────────────────────

import { dirname, join } from "path";
import { Expression, ObjectLiteralExpression, Project, SourceFile, SyntaxKind } from "ts-morph";
import logger from "../../logging/logger.js";
import { ComponentInfo, ComponentRegistry } from "../../models/component-info.js";
import { ComponentRoute, ComponentRouteMap, ComponentRouteRole, RedirectRoute, RouteMap } from "../../models/route-info.js";
import { AstUtils } from "../../parsers/ast-utils.js";

/**
 * Utility methods for **route-related** operations in an Angular workspace:
 *
 * 1. Selector ↔ ClassName mapping & lookup
 * 2. Routing-file detection
 * 3. Route aggregation (collectAllRoutes, analyzeFile, processRoutes, recurseLazyModule)
 * 4. Deduplication & normalization (dedupe, normalize)
 * 5. Usage counting & ComponentRouteMap construction (countReachableUsage, buildComponentRouteMap)
 */
export class RoutingUtils {
    // ──────────────── Selector ↔ ClassName & lookup ──────────────────

    /**
     * Retrieves the route path for a given component selector.
     *
     * @param selector - The kebab-case selector (e.g. 'app-header').
     * @param routeMap - The raw RouteMap to search.
     * @returns The matching route path (no leading slash), or undefined.
     */
    static getRouteFromSelector(selector: string, routeMap: RouteMap): string | undefined {
        // Convert kebab-case selector to PascalCase component class name
        const className = AstUtils.convertSelectorToClassName(selector);

        // Find the first route entry whose `component` matches the className
        return routeMap.routes.find((cmpRoute) => cmpRoute.component === className)?.route;
    }

    /**
     * Retrieves *all* route paths for a given component selector.
     *
     * @param selector - The kebab-case selector.
     * @param routeMap - The RouteMap to search.
     * @returns Array of matching route paths (no leading slash).
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
     * Finds selectors of components whose `nestedComponents` include the target selector.
     *
     * @param selector     - The child component’s selector.
     * @param componentMap - All discovered components.
     * @returns Array of parent selectors whose templates include the child.
     */
    static findParentComponents(selector: string, componentMap: ComponentInfo[]): string[] {
        return componentMap
            .filter(c => c.nestedComponents.includes(selector))
            .map(c => c.selector);
    }

    /**
     * Recursively resolves parent route paths for a component by following nesting.
     *
     * @param component     - The child ComponentInfo.
     * @param componentMap  - All ComponentInfo entries.
     * @param routeMap      - The RouteMap of the app.
     * @returns Unique array of parent route paths (each *with* leading slash).
     */
    static findParentRoutes(
        component: ComponentInfo,
        componentMap: ComponentInfo[],
        routeMap: RouteMap
    ): string[] {
        // Find the selectors of components that declare `component.selector` in their nestedComponents
        const parents = this.findParentComponents(component.selector, componentMap);
        const parentRoutes: string[] = [];

        for (const parentSel of parents) {
            // Attempt to retrieve the route path for the parent component
            const route = RoutingUtils.getRouteFromSelector(parentSel, routeMap);

            if (route) {
                // If a direct route is found, prefix with '/'
                parentRoutes.push(`/${route}`);
            }
            else {
                // Otherwise, attempt to recursively find higher-level parent routes
                const parentComp = componentMap.find((c) => c.selector === parentSel);
                if (parentComp)
                    parentRoutes.push(
                        ...this.findParentRoutes(parentComp, componentMap, routeMap)
                    );
            }
        }

        // Deduplicate by converting to a Set, then back to an array
        return [...new Set(parentRoutes)];
    }

    // ──────────────── Routing-file detection ──────────────────

    /**
     * Checks whether a `.ts` file declares or imports any Angular routes.
     *
     * @param sf - SourceFile to inspect.
     * @returns `true` if it imports `@angular/router`; otherwise `false`.
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
     * Walks all routing files in the project to collect every route + redirect.
     *
     * @param project   - The ts-morph Project.
     * @param seenFiles - A Set of file paths already processed (to avoid loops).
     * @returns Promise resolving to the raw RouteMap.
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
     * Extracts RouteMap from a single routing file by reading `Routes` arrays
     * and `RouterModule.forRoot`/`forChild` calls.
     *
     * @param project   - The ts-morph Project.
     * @param sf        - The routing SourceFile to analyze.
     * @param seenFiles - Already visited file paths.
     * @returns Promise resolving to that file’s RouteMap.
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
                await this.processRoutes(project, sf, seenFiles, arg.getElements(), map);
            else if (arg?.isKind(SyntaxKind.Identifier)) {
                // resolve const X:
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
     * Recursively processes each `ObjectLiteralExpression` in a Routes[] AST,
     * extracting component/lazy-load info, guards, resolvers, data, redirects,
     * and descending into `children` arrays.
     *
     * @param project     - The ts-morph Project.
     * @param sf          - The current routing file.
     * @param seenFiles   - Set of visited file paths.
     * @param elements    - AST nodes of the route array.
     * @param routeMap    - In-place accumulator for routes & redirects.
     * @param parentPath  - Prefix path for nested routes (default `""`).
     * @modifies routeMap.routes, routeMap.redirections
     * @returns Promise that resolves once all elements are processed.
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
            // Only consider objects like { path: '...', component: X, children: [ … ] }.
            if (!element.isKind(SyntaxKind.ObjectLiteralExpression))
                continue;

            const objLit = element as ObjectLiteralExpression;

            // Skip if no `path` property is declared on this object.
            if (!AstUtils.hasProp(objLit, "path"))
                continue;

            // 1) path
            const rawPath = AstUtils.getPropAsText(objLit, "path") ?? ""; // e.g. "", "users/:id"
            const combined = [parentPath, rawPath]
                .filter(Boolean)
                .join('/')
                .replace(/\/+/g, '/');

            const fullPath = combined; // e.g. 'admin/users/:id'

            logger.log('trace', `[RoutingUtils] Processing route object for path: "${fullPath}"`);

            // 2) pathMatch (e.g. { path: '', redirectTo: 'home', pathMatch: 'full' })
            const pathMatch = AstUtils.getPropAsText(objLit, "pathMatch") as "full" | "prefix" | undefined;

            // 3a) Eager‐loaded component? (component: DashboardComponent)
            const componentName = AstUtils.getPropAsText(objLit, "component");

            // 3b) Lazy‐loaded module? (loadChildren: () => import('…').then(m => m.SomeModule))
            const loadChildrenText = AstUtils.getPropAsText(objLit, "loadChildren");

            // 3c) Lazy‐loaded component? (loadComponent: () => import('…').then(m => m.SomeComponent))
            const loadComponentText = AstUtils.getPropAsText(objLit, "loadComponent");

            // 4) guards + resolvers + data
            const canActivate = AstUtils.getPropAsStringArray(objLit, "canActivate");
            const canLoad = AstUtils.getPropAsStringArray(objLit, "canLoad");
            const canActivateChild = AstUtils.getPropAsStringArray(objLit, "canActivateChild");
            const resolveMap = AstUtils.getPropAsObjectLiteral(objLit, "resolve");
            const dataMap = AstUtils.getPropAsObjectLiteral(objLit, "data");

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
                    logger.info(`[RoutingUtils] "${fullPath}" → component "${componentName}"`);
                }
                if (loadChildrenText) {
                    routeEntry.loadChildren = loadChildrenText;
                    logger.info(`[RoutingUtils] "${fullPath}" → lazy-module "${loadChildrenText}"`);

                    await this.recurseLazyModule(project, sf, seenFiles, loadChildrenText, fullPath, routeMap);
                }
                if (loadComponentText) {
                    routeEntry.loadComponent = loadComponentText;
                    // extract the standalone component’s class name
                    const match = /\.then\(\s*\w+\s*=>\s*\w+\.(\w+)\)/.exec(loadComponentText);
                    if (match?.[1])
                        routeEntry.component = match[1];

                    logger.info(`[RoutingUtils] "${fullPath}" → lazy-component "${loadComponentText}"`);
                }

                routeMap.routes.push(routeEntry);
            }

            // 6) If `redirectTo` is defined, record it (with pathMatch if present):
            const redirectTo = AstUtils.getPropAsText(objLit, "redirectTo") ?? "";
            if (redirectTo) {
                const redirectEntry: RedirectRoute = { route: fullPath, redirectTo, pathMatch };
                routeMap.redirections.push(redirectEntry);
                logger.info(`[RoutingUtils] "${fullPath}" --redirect→ "${redirectTo}"`);
            }

            // 7) If `children: [ … ]` exists, recursively process nested routes
            const childrenInit = AstUtils.getPropInitializer(objLit, "children");
            if (childrenInit?.isKind(SyntaxKind.ArrayLiteralExpression))
                await this.processRoutes(
                    project,
                    sf,
                    seenFiles,
                    childrenInit.getElements(),
                    routeMap,
                    rawPath === "" ? parentPath : fullPath
                );
        }
    }

    /**
     * Recursively loads a lazy-loaded routing module and prefixes all its routes
     * & redirects with the parent path.
     *
     * @param project         - The ts-morph Project.
     * @param sf              - The file where `loadChildren` was found.
     * @param seenFiles       - Files already processed (to avoid cycles).
     * @param loadChildrenText - The `loadChildren` import expression text.
     * @param fullPath        - Parent route prefix.
     * @param routeMap        - Accumulates child routes & redirections.
     * @modifies routeMap.routes, routeMap.redirections
     * @returns Promise that resolves once all child routes are prefixed.
     */
    static async recurseLazyModule(
        project: Project,
        sf: SourceFile,
        seenFiles: Set<string>,
        loadChildrenText: string,
        fullPath: string,
        routeMap: RouteMap
    ) {
        const [, importPath] =
            /import\(['"](.*)['"]\)/.exec(loadChildrenText) || [];
        if (!importPath)
            return;

        logger.debug(
            `[RoutingUtils] Recursing into lazy module for "${fullPath}", import="${loadChildrenText}"`
        );

        const dir = dirname(sf.getFilePath());
        const routingFile = join(
            dir,
            importPath.replace(/\.module$/, '') + '-routing.module.ts'
        );
        const moduleFile = join(dir, importPath + '.ts');

        const childSf =
            project.getSourceFile(routingFile) ||
            project.getSourceFile(moduleFile);

        logger.info(`[RoutingUtils] looking for %o | %o: %o`, routingFile, moduleFile, !!childSf);
        if (childSf && !seenFiles.has(childSf.getFilePath())) {
            seenFiles.add(childSf.getFilePath());
            const childMap = await this.analyzeFile(project, childSf, seenFiles);

            // prefix every child route / redirect
            for (const cr of childMap.routes) {
                routeMap.routes.push({
                    ...cr,
                    route:
                        fullPath +
                        (cr.route.startsWith('/') ? '' : '/') +
                        cr.route
                });
            }

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
     * Deduplicates routes & redirects in a RouteMap, merging metadata.
     *
     * @param raw - The raw RouteMap.
     * @returns A new RouteMap with unique `routes` & `redirections`.
     */
    static dedupe(raw: RouteMap): RouteMap {
        // helper to merge string arrays uniquely
        const mergeArr = (a?: string[], b?: string[]) =>
            a || b ? Array.from(new Set([...(a || []), ...(b || [])])) : undefined;

        const uniqR = new Map<string, ComponentRoute>();
        for (const r of raw.routes) {
            const existing = uniqR.get(r.route);
            if (!existing)
                // clone so we don't modify the original
                uniqR.set(r.route, { ...r });
            else {
                // merge everything into `existing`
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

        const uniqRD = new Map<string, RedirectRoute>();
        for (const rd of raw.redirections) {
            const existing = uniqRD.get(rd.route);
            if (!existing)
                uniqRD.set(rd.route, rd);
            else {
                // if we ever have two redirects on the same path,
                // we might want to reconcile `pathMatch` here too
                existing.redirectTo ||= rd.redirectTo;
                existing.pathMatch ||= rd.pathMatch;
            }
        }

        // Ensure redirect-only paths still show up as “empty” routes
        for (const rd of raw.redirections) {
            if (!uniqR.has(rd.route))
                uniqR.set(rd.route, { route: rd.route });
            if (!uniqR.has(rd.redirectTo))
                uniqR.set(rd.redirectTo, { route: rd.redirectTo });
        }

        return {
            routes: Array.from(uniqR.values()),
            redirections: Array.from(uniqRD.values())
        };
    }

    /**
     * Normalizes every path in a RouteMap to start with “/” and not end with “/” (except root).
     *
     * @param raw - The RouteMap to normalize in-place.
     * @returns The same RouteMap (paths mutated).
     */
    static normalize(raw: RouteMap): RouteMap {
        const norm = (p: string) => {
            // root
            if (p === '' || p === '/')
                return '/';

            // ensure leading slash
            let s = p.startsWith('/') ? p : '/' + p;

            // strip trailing slash
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
     * Counts, for each component class, how many distinct routes it (transitively) appears in.
     *
     * @param routes       - All component routes to start from.
     * @param registry     - ComponentRegistry for nested‐component lookup.
     * @param rootSelector - The app‐root selector (default 'app-root').
     * @returns Map from component class name → usage count.
     */
    static countReachableUsage(
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
            const stack = [r.component, ...(rootName ? [rootName] : [])];

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

    /**
     * Classifies every ComponentInfo into one of: root, global, shared, mapped, dead.
     *
     * @param registry     - The full ComponentRegistry.
     * @param routeMap     - A normalized RouteMap.
     * @param usage        - Precomputed usage counts.
     * @param rootSelector - The selector for the root component.
     * @returns A ComponentRouteMap with grouped components by their roles.
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

        // find AppComponent by selector
        const rootComp = registry.getBySelector(rootSelector);
        if (rootComp)
            roles.root.push(rootComp);


        // build a set of *directly* mapped component names
        const totalRoutes = routeMap.routes.length;
        const directlyMapped = new Set(
            routeMap.routes
                .filter(r => !!r.component)
                .map(r => r.component!)
        );

        for (const ci of registry.components) {
            // skip the root entry if already classified
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
                // if it’s also a top‐level route component, treated as mapped;
                // otherwise it’s “shared” by virtue of nesting in exactly one route
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
}