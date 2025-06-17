// ──────────────────────────────────────────────────────────────────────────────
// route-info.ts
//
// Contains all the “routing-centric” types:
//
//   - ComponentRoute        — maps a route path → component class name OR a lazy module
//   - RedirectRoute         — maps a route path → redirectTo (+ optional pathMatch)
//   - RouteMap              — the raw app configuration (routes + redirects)
//   - ComponentRouteRole    — (new) “root” | “global” | “shared” | “mapped” | “dead”
//   - ComponentRouteMap     — (new) bundles RouteMap + roles record
// ──────────────────────────────────────────────────────────────────────────────

import { ComponentInfo } from "./component-info.js";

/**
 * Represents a route that loads a component (or lazy-loaded module).
 */
export interface ComponentRoute {
    /**
     * The path of the route (e.g., "dashboard", "users/:id", or "" for an empty root path).
     */
    route: string;

    /**
     * Eager‐loaded component name (e.g. "DashboardComponent").
     * Exactly one of `component` or `loadChildren`/`loadComponent` will be non‐empty.
     */
    component?: string;

    /**
     * If this is a lazy‐loaded route, this is the module path or function text
     * (e.g. () => import('./foo/foo.module').then(m => m.FooModule) ). 
     */
    loadChildren?: string;

    /**
     * OR, for Angular v15+ standalone routing, a `loadComponent` call that returns a component
     * (e.g. () => import('./login/login.component').then(m => m.LoginComponent) ).
     */
    loadComponent?: string;

    /**
     * The `pathMatch` strategy (e.g. "full" or "prefix") if specified on this route.
     * If not present, Angular defaults to "prefix".
     */
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
    resolve?: { [key: string]: string };

    /**
     * Arbitrary static data that can be passed to the route (e.g. `{ title: "User Profile", icon: "user" }`).
     * This data object will be available via the ActivatedRoute’s `data` observable.
     * Use this to provide custom labels, icons, or other metadata. This object will be
     * empty if no static `data` is specified on the route.
     */
    data?: { [key: string]: string };
}

/**
 * Represents a route that redirects to another route.
 */
export interface RedirectRoute {
    /**
     * The original route path (e.g., "old-path" or "").
     */
    route: string;

    /**
     * The path to which this route redirects (e.g., "new-path").
     */
    redirectTo: string;

    /**
     * Optional `pathMatch` (e.g. `"full"` or `"prefix"`).
     * If omitted, Angular defaults to `"prefix"`. When `pathMatch` is `"full"`,
     * only an exact match of the URL will trigger the redirect. When `"prefix"`,
     * any URL that starts with `route` will trigger the redirect.
     */
    pathMatch?: "full" | "prefix";
}

/**
 * Represents the application's complete route map:
 *   - `routes`: routes that load a component (or lazy module)
 *   - `redirections`: routes that simply redirect elsewhere
 *   - `sharedComponents`: components not tied exclusively to a single `ComponentRoute`.
 */
export interface RouteMap {
    /**
     * All route definitions that load a component (or lazy-loaded module).
     */
    routes: ComponentRoute[];

    /**
     * All route definitions that redirect to another path.
     */
    redirections: RedirectRoute[];
}

/**
 * Indicates the role a component can play under a route.
 * 
 * After analyzing all routes, we classify every component as:
 *  - root    = <app-root>
 *  - global  = appears effectively on *all* routes (e.g. app-root or transitively everywhere)
 *  - shared  = appears on multiple routes
 *  - mapped  = appears on exactly one route
 *  - dead    = never appears for any route
 */
export type ComponentRouteRole = "root" | "global" | "shared" | "mapped" | "dead";

/**
 * Combines the raw RouteMap with component-classification.
 *
 * Roles:
 *  - root   — the single `<app-root>` entry
 *  - global — transitively present on *every* route
 *  - shared — present on more than one (but not all) routes
 *  - mapped — directly tied to exactly one route
 *  - dead   — never used by any route
 */
export interface ComponentRouteMap {
    /** The raw routing configuration (all ComponentRoute + RedirectRoute). */
    routeMap: RouteMap;

    /** Roles of the components with respect to the routes */
    roles: Record<ComponentRouteRole, ComponentInfo[]>;
}