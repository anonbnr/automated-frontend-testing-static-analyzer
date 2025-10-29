// ──────────────────────────────────────────────────────────────────────────────
// analyzers/routes/route-analyzer.ts
//
// Coordinates the full Angular **route analysis** pipeline.
//
// Pipeline:
//   1) Collect & parse all routing configurations across the workspace
//   2) Normalize paths and deduplicate routes/redirects (merging metadata)
//   3) Compute transitively-reachable component usage across routes
//   4) Classify components into roles: root, global, shared, mapped, dead
//
// Design notes
//   • Stateless helpers live in RoutingUtils; this orchestrator wires them together.
//   • `_seenFiles` prevents cycles when traversing lazy-loaded modules.
//   • Input is a ts-morph Project + a prebuilt ComponentRegistry snapshot.
//   • Output is a ComponentRouteMap (raw map + role buckets).
//
// Logging
//   • Uses info/debug/trace for transparency; safe to lower verbosity upstream.
//
// Error handling
//   • Upstream utils are designed to be conservative: unknown patterns are skipped,
//     not thrown. This orchestrator expects partial/heterogeneous codebases.
//
// ──────────────────────────────────────────────────────────────────────────────

import { Project } from 'ts-morph';
import logger from '../../logging/logger.js';
import { ComponentRegistry } from '../../models/component-info.js';
import { ComponentRouteMap } from '../../models/route-info.js';
import { RoutingUtils } from './route-utils.js';

/**
 * Orchestrates end-to-end route analysis over a ts-morph Project.
 *
 * Steps performed by {@link analyzeProject}:
 *   1. Collect & parse all routing configs (including lazy modules)
 *   2. Normalize & dedupe routes + redirects
 *   3. Count component usage transitively (direct + nested + optional root shell)
 *   4. Classify components into root/global/shared/mapped/dead
 *
 * The analyzer keeps a private `_seenFiles` set to avoid reprocessing the same
 * file during lazy-module recursion.
 *
 * @example
 * ```ts
 * const analyzer = new RouteAnalyzer(project);
 * const routeMap = await analyzer.analyzeProject(componentRegistry);
 * ```
 */
export class RouteAnalyzer {
    /** Tracks routing files already processed (guards against lazy-module cycles). */
    private _seenFiles = new Set<string>();

    /**
     * Create a RouteAnalyzer bound to a given project.
     *
     * @param project The ts-morph Project to analyze.
     */
    constructor(private project: Project) { }

    // ────────────────────────────────────────────────────────────────────────────
    // 1) PUBLIC API
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Discovers, deduplicates, and classifies all application routes.
     *
     * Orchestration outline:
     *  - Collect raw routes/redirects from all files that import `@angular/router`
     *  - Normalize paths to leading-"/" + no trailing "/" (except root)
     *  - Dedupe by path, merging guard/resolve/data arrays/maps
     *  - Compute transitive component reachability counts
     *  - Build ComponentRouteMap with role buckets
     *
     * @param registry Prebuilt ComponentRegistry snapshot (selector/class ↔ nested components).
     * @returns ComponentRouteMap containing the final route graph and role groupings.
     */
    async analyzeProject(
        registry: ComponentRegistry
    ): Promise<ComponentRouteMap> {
        logger.info('[RouteAnalyzer] Starting route analysis');
        logger.debug(
            `[RouteAnalyzer] Project contains ${this.project.getSourceFiles().length} source files, seenFiles=${this._seenFiles.size}`
        );

        // 1) Gather every route + redirect in the workspace (lazy recursion included)
        const rawMap = await RoutingUtils.collectAllRoutes(this.project, this._seenFiles);
        logger.info(
            `[RouteAnalyzer] Collected ${rawMap.routes.length} routes and ${rawMap.redirections.length} redirects`
        );
        logger.log(
            'trace',
            `[RouteAnalyzer] Raw routes: ${rawMap.routes.map(r => r.route).join(', ')}`
        );

        // 2) Normalize (“/foo”), then dedupe (merge metadata on duplicate paths)
        const normalized = RoutingUtils.normalize(rawMap);
        logger.info('[RouteAnalyzer] Normalized routes');
        logger.debug(
            `[RouteAnalyzer] Normalized routes: ${normalized.routes
                .map(r => r.route)
                .join(', ')}`
        );

        const deduped = RoutingUtils.dedupe(normalized);
        logger.info(
            `[RouteAnalyzer] Deduped to ${deduped.routes.length} unique routes and ${deduped.redirections.length} redirects`
        );

        // 3) Count how many distinct routes each component appears in (transitively)
        const reachUsage = RoutingUtils.countReachableUsage(deduped.routes, registry);
        logger.info(
            `[RouteAnalyzer] Computed reachable usage for ${reachUsage.size} components`
        );
        logger.log(
            'trace',
            `[RouteAnalyzer] Usage map: ${JSON.stringify(
                Array.from(reachUsage.entries())
            )}`
        );

        // 4) Classify each component into root/global/shared/mapped/dead
        const result = RoutingUtils.buildComponentRouteMap(registry, deduped, reachUsage);
        logger.info(
            '[RouteAnalyzer] Built ComponentRouteMap: %o',
            {
                root: result.roles.root.length,
                global: result.roles.global.length,
                shared: result.roles.shared.length,
                mapped: result.roles.mapped.length,
                dead: result.roles.dead.length,
            }
        );

        return result;
    }
}