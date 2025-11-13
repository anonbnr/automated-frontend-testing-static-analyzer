// ──────────────────────────────────────────────────────────────────────────────
// models/route-info.ts
//
// Purpose
//   Canonical types for Angular routing used by analyzers/builders:
//     - Route              : common base for component/redirect entries
//     - ComponentRoute     : renders a component (eager/standalone) or lazy module
//     - RedirectRoute      : immediate redirection
//     - RouteMap           : project-wide raw route configuration
//     - ComponentRouteRole : component classification w.r.t. routes
//     - ComponentRouteMap  : RouteMap + components grouped by role
//
// Notes
//   • `route` values are Angular path segments (no leading slash). The empty
//     string "" denotes the default segment at its level.
//   • `module` holds the NgModule class name that *declared* the route.
//   • Exactly one of `component` | `loadChildren` | `loadComponent` is used
//     by Angular per route; they are optional here to support static analysis
//     across versions and patterns.
//   • Guards/resolvers/data are recorded by class-name strings / string maps.
// ──────────────────────────────────────────────────────────────────────────────

import { ComponentInfo } from "./component-info.js";
import { RowDataPacket } from "mysql2/promise";

/**
 * Base information common to both component and redirect routes.
 */
export interface Route {
    /**
    * Angular path segment for this route (e.g., "dashboard", "users/:id", or
    * "" for the default/empty segment at its level). No leading slash.
    */
    route: string;

    /**
    * The NgModule class name that declared this route.
    * Optional to accommodate standalone-routing-only projects or cases where
    * attribution is not available from static analysis.
    */
    module?: string;
}

/**
 * A route that renders content by either:
 *  • an eager component (`component`)
 *  • a lazy-loaded NgModule (`loadChildren`)
 *  • a standalone component (`loadComponent`, Angular v15+)
 *
 * Only one of these is expected to be present at runtime configuration,
 * but all are optional here for analysis flexibility.
 */
export interface ComponentRoute extends Route {
    /** Eager-loaded component class name (e.g., "DashboardComponent"). */
    component?: string;

    /**
    * Lazy-loaded module factory expression as a stringified representation of
    * the configured `loadChildren` (e.g., a dynamic import call).
    */
    loadChildren?: string;

    /**
    * Standalone component loader expression (Angular v15+),
    * stringified representation of the configured `loadComponent`.
    */
    loadComponent?: string;

    /** `pathMatch` strategy for this route. Defaults to `"prefix"` in Angular. */
    pathMatch?: "full" | "prefix";

    /**
    * Guard classes that implement `CanActivate`, invoked before activating
    * this route. Empty/undefined if not specified.
    */
    canActivate?: string[];

    /**
    * Guard classes that implement `CanActivateChild`, invoked for navigation
    * to any child of this route. Empty/undefined if not specified.
    */
    canActivateChild?: string[];

    /**
    * Guard classes that implement `CanLoad`, invoked before Angular attempts
    * to lazy-load a module for this route. Empty/undefined if not specified.
    */
    canLoad?: string[];

    /**
    * Resolver entries (key → resolver class name). Each resolver implements
    * `Resolve<T>`; Angular executes them before activation and exposes the
    * resolved values via `ActivatedRoute.data`.
    */
    resolve?: Record<string, string>;

    /**
    * Arbitrary static data attached to the route (key → string).
    * Available via `ActivatedRoute.data`. Commonly used for titles, icons, etc.
    */
    data?: Record<string, string>;
}

/**
 * A route that immediately redirects to another path.
 */
export interface RedirectRoute extends Route {
    /** The target path to which this route redirects (Angular path segment). */
    redirectTo: string;
    
    /** `pathMatch` strategy for the redirect. Defaults to `"prefix"` in Angular. */
    pathMatch?: "full" | "prefix";
}

export interface RowComponentRoute extends RowDataPacket {
    route: string;
    module?: string;
    component?: string;
    loadChildren?: string;
    loadComponent?: string;
    pathMatch?: "full" | "prefix";
    canActivate?: string;
    canActivateChild?: string;
    canLoad?: string;
    resolve?: string;
    data?: string;
}
export interface RowRedirectRoute extends RowDataPacket {
    route: string;
    module?: string;
    redirectTo: string;
    pathMatch?: "full" | "prefix";
}

/**
 * The application's raw routing configuration as discovered by static analysis.
 *
 * - `routes`       : all component-/lazy-module-loading routes
 * - `redirections` : all redirect-only routes
 */
export interface RouteMap {
    /** Routes that load a component or lazy module (directly or via standalone). */
    routes: ComponentRoute[];

    /** Routes that simply redirect elsewhere. */
    redirections: RedirectRoute[];
}

/**
 * How a component participates in the application's routes:
 *
 * - `root`   — the `<app-root>` host component
 * - `global` — present (transitively) on *every* route
 * - `shared` — present on multiple-but-not-all routes
 * - `mapped` — tied to exactly one route (direct or lazy mapping)
 * - `dead`   — not reachable under any route
 */
export type ComponentRouteRole
    = 'root'
    | 'global'
    | 'shared'
    | 'mapped'
    | 'dead'

/**
 * Combines the raw routing map with each component's role classification.
 */
export interface ComponentRouteMap {
    /** The raw routing configuration (all ComponentRoute + RedirectRoute). */
    routeMap: RouteMap;

    /**
    * Components grouped by their RouteRole.
    *
    * - root:   [ComponentInfo for `<app-root>`]
    * - global: present on all routes
    * - shared: present on >1 but <all routes
    * - mapped: present on exactly 1 route
    * - dead:   never present under any route
    */
    roles: Record<ComponentRouteRole, ComponentInfo[]>;
}

export interface rowRouteRoles extends RowDataPacket {
    root: string,
    global: string,
    shared: string,
    mapped: string,
    dead: string,
}

export interface RouteRoles {
    root: string[],
    global: string[],
    shared: string[],
    mapped: string[],
    dead: string[],
}