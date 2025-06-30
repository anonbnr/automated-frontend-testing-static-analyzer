// ──────────────────────────────────────────────────────────────────────────────
// models/route-info.ts
//
// Contains types for routing configuration, component-role classification,
// and the combined route map used by the analyzer:
//   - Route               (base path + declaring module)
//   - ComponentRoute      (loads a component or lazy module)
//   - RedirectRoute       (redirects one path to another)
//   - RouteMap            (all routes + all redirects)
//   - ComponentRouteRole  (classifies components wrt routes)
//   - ComponentRouteMap   (raw RouteMap + component-role assignments)
// ──────────────────────────────────────────────────────────────────────────────

import { ComponentInfo } from "./component-info.js";

/**
 * Base information common to both component and redirect routes.
 */
export interface Route {
    /** The path of this route (e.g. "dashboard", "users/:id", or "" for root). */
    route: string;

    /** The NgModule class name that declared this route. */
    module?: string;
}

/**
 * A route that loads either:
 *  - an eager component, or
 *  - a lazy NgModule, or
 *  - a standalone component (via `loadComponent`)
 */
export interface ComponentRoute extends Route {
    /** Eager-loaded component class name (e.g. "DashboardComponent"). */
    component?: string;

    /** Lazy-loaded module factory expression. */
    loadChildren?: string;

    /** Standalone component loader (Angular v15+). */
    loadComponent?: string;

    /** `pathMatch` strategy: `"full"` or `"prefix"` (default `"prefix"`). */
    pathMatch?: "full" | "prefix";

    /**
     * Any `canActivate` guard classes (e.g. `["AuthGuard", "AdminGuard"]`).
     * Guard classes listed here must implement `CanActivate` and will be invoked
     * before activating this route. This array will be empty if no `canActivate` guards are specified.
     */
    canActivate?: string[];

    /**
     * Any `canActivateChild` guard classes (e.g. `["AdminChildGuard"]`).
     * Guard classes listed here must implement `CanActivateChild` and will be invoked
     * when navigating to any child of this route. Useful to protect nested routes under a parent.
     * This array will be empty if no `canActivateChild` guards are specified.
     */
    canActivateChild?: string[];

    /**
     * Any `canLoad` guard classes (e.g. `["AuthGuard"]`).
     * Guard classes listed here must implement `CanLoad` and will be invoked
     * before Angular attempts to lazy‐load a module for this route. This prevents
     * the module from being fetched if the guard denies access. This array will be
     * empty if no `canLoad` guards are specified.
     */
    canLoad?: string[];

    /**
     * Any resolver entries (e.g. `{ user: "UserResolver", settings: "SettingsResolver" }`).
     * A resolver is a service that implements `Resolve<T>`. Angular will execute the
     * specified resolver(s) before activating the route, and make the returned data
     * available under the specified key(s). This object will be empty if no resolvers are defined.
     */
    resolve?: Record<string, string>;

    /**
     * Arbitrary static data that can be passed to the route (e.g. `{ title: "User Profile", icon: "user" }`).
     * This data object will be available via the ActivatedRoute’s `data` observable.
     * Use this to provide custom labels, icons, or other metadata. This object will be
     * empty if no static `data` is specified on the route.
     */
    data?: Record<string, string>;
}

/**
 * A route that immediately redirects to another path.
 */
export interface RedirectRoute extends Route {
    /** The target path to which this route redirects. */
    redirectTo: string;

    /** `pathMatch` strategy for the redirect (default `"prefix"`). */
    pathMatch?: "full" | "prefix";
}

/**
 * The application’s raw routing configuration:
 *  - `routes`      : all component-loading routes
 *  - `redirections`: all redirect-only routes
 */
export interface RouteMap {
    /** Routes that load a component or lazy module. */
    routes: ComponentRoute[];

    /** Routes that simply redirect elsewhere. */
    redirections: RedirectRoute[];
}

/**
 * How a component participates in the application’s routes:
 *
 * - `root`   — the `<app-root>` component  
 * - `global` — present (transitively) on *every* route  
 * - `shared` — appears on multiple-but-not-all routes  
 * - `mapped` — tied to exactly one route (via direct or lazy mapping)  
 * - `dead`   — never used by any route  
 */
export type ComponentRouteRole
    = 'root'
    | 'global'
    | 'shared'
    | 'mapped'
    | 'dead'

/**
 * Combines the raw routing map with each component’s role classification.
 */
export interface ComponentRouteMap {
    /** The raw routing configuration (all ComponentRoute + RedirectRoute). */
    routeMap: RouteMap;

    /**
     * Components grouped by their RouteRole.
     *
     * - root:  [ ComponentInfo for `<app-root>` ]  
     * - global: present on all routes  
     * - shared: present on >1 but <all routes  
     * - mapped: present on exactly 1 route  
     * - dead: never present under any route  
     */
    roles: Record<ComponentRouteRole, ComponentInfo[]>;
}