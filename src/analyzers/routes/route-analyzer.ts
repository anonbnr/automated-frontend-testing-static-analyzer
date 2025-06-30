// ──────────────────────────────────────────────────────────────────────────────
// analyzers/routes/route-analyzer.ts
//
// Coordinates the full Angular route analysis pipeline:
//   1. Collect & parse all routing configurations
//   2. Normalize & dedupe routes + redirects
//   3. Compute transitively-reachable component usage
//   4. Classify components into roles: root, global, shared, mapped, dead
// ──────────────────────────────────────────────────────────────────────────────

import { Project } from 'ts-morph';
import { ComponentRegistry } from '../../models/component-info.js';
import { ComponentRouteMap } from '../../models/route-info.js';
import { RoutingUtils } from './route-utils.js';
import logger from '../../logging/logger.js';

/**
 * Orchestrates end-to-end route analysis:
 *   1. Collect & parse all routing configs
 *   2. Normalize & dedupe routes + redirects
 *   3. Count component usage transitively
 *   4. Classify components into root/global/shared/mapped/dead
 *
 * Maintains a private `_seenFiles` set to avoid reprocessing lazy modules.
 *
 * @example
 * ```ts
 * const analyzer = new RouteAnalyzer(project);
 * await analyzer.analyzeProject(componentRegistry);
 * ```
 */
export class RouteAnalyzer {
    /** Tracks routing files already processed (to break lazy-module loops). */
    private _seenFiles = new Set<string>();

    /**
     * Initializes the RouteAnalyzer with the project to analyze
     * @param project - The ts-morph Project to analyze
     */
    constructor(private project: Project) { }

    // ────────────────────────────────────────────────────────────────────────────
    // 1) PUBLIC API
    // ────────────────────────────────────────────────────────────────────────────

    /**
     * Discovers, deduplicates, and classifies all application routes.
     *
     * @param registry - Prebuilt ComponentRegistry
     * @returns A ComponentRouteMap with `.routeMap` and `.roles`
     */
    async analyzeProject(
        registry: ComponentRegistry
    ): Promise<ComponentRouteMap> {
        logger.info('[RouteAnalyzer] Starting route analysis');
        logger.debug(
            `[RouteAnalyzer] Project contains ${this.project.getSourceFiles().length} source files, seenFiles=${this._seenFiles.size}`
        );

        // 1) Gather every route + redirect in the workspace
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

        // 4) Finally, classify each component into root/global/shared/mapped/dead
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