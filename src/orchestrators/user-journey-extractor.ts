// ──────────────────────────────────────────────────────────────────────────────
// orchestrators/user-journey-extractor.ts
//
//  user-journey-extractor
//  ======================
//  Orchestrates the end-to-end pipeline to produce a UserJourneyRegistry:
//    1) Runs the static analyzer to build the navigation multigraph.
//    2) Uses UserJourneyRegistryBuilder to assemble + process user journeys.
//  
//  Notes
//  -----
//  - The extractor is intentionally thin and side-effect free.
//  - It accepts fanout behavior so callers can choose "primary" vs "collapse".
// ──────────────────────────────────────────────────────────────────────────────

import { getAnalyze, setNavigationGraph, setUserJourney } from "../adapters/appCache.js";
import { FanoutMode } from "../builders/user-journeys/user-journey-processors.js";
import { UserJourneyRegistryBuilder } from "../builders/user-journeys/user-journey-registry-builder.js";
import logger from "../logging/logger.js";
import { UserJourneyRegistry } from "../models/user-journeys/user-journey-info.js";
import { StaticAnalyzer } from "./static-analyzer.js";

/** Optional knobs for registry extraction. */
export interface ExtractOptions {
    /** Pre-processor fanout behavior. Defaults to "primary". */
    fanoutMode?: FanoutMode;
    /**
     * Optional analyzer depth or other tuning parameters.
     * (Currently passthrough/reserved — wire up when StaticAnalyzer supports it.)
     */
    maxDepth?: number;
}

export class UserJourneyExtractor {
    private staticAnalyzer: StaticAnalyzer;

    /**
    * @param tsConfigPath Absolute path to the project's tsconfig.json
    */
    constructor(private tsConfigPath: string) {
        this.staticAnalyzer = new StaticAnalyzer(this.tsConfigPath);
    }

    /**
    * Run the pipeline and return a UserJourneyRegistry.
    *
    * Workflow:
    *  - Try to serve from cache:
    *      * If journeys are cached → assemble a registry from them.
    *      * Else ensure graph+routes are cached (analyze if missing), then build registry.
    *  - Persist each journey in cache for later quick responses.
    *
    * Observability:
    *  - Logs whether cache was hit/missed for journeys and graph.
    *  - Uses info level for high-level steps, trace for verbose internals.
    *
    * @param options Extraction options (fanout mode, reserved knobs).
    * @param projectRoot Absolute root of the project; used as cache key.
    */
    async extract(options: ExtractOptions = {}, projectRoot: string): Promise<UserJourneyRegistry> {
        const { fanoutMode = "primary" } = options;

        // Peek at cache (if any) for this project.
        const analyze = getAnalyze(projectRoot);
        const journeys = analyze?.journeys;

        // Fast-path: return cached journeys if present.
        if (journeys && journeys.size !== 0) {
            const registry = new UserJourneyRegistry();

            for (const journeyValue of journeys.values())
                registry.add(journeyValue.journey);

            logger.info('[UserJourneyExtractor] Using cached user journeys for "%s" (count=%d)"',
                projectRoot,
                registry.size()
            );

            return registry;
        }

        // Journeys not cached. Make sure graph + route map exist (from cache or fresh analysis).
        let navGraph = analyze?.graph;
        let compRouteMap = analyze?.compRouteMap;

        if (!navGraph || !compRouteMap) {
            // Build graph via static analysis
            logger.info(
                '[UserJourneyExtractor] Building navigation graph for "%s" (cache miss)',
                projectRoot
            );

            navGraph = await this.staticAnalyzer.analyze();
            compRouteMap = this.staticAnalyzer.compRouteMap;
            setNavigationGraph(projectRoot, navGraph, compRouteMap);

            logger.info(
                '[UserJourneyExtractor] Cached navigation graph for "%s"; routes=%d redirects=%d',
                projectRoot,
                compRouteMap.routeMap.routes.length,
                compRouteMap.routeMap.redirections.length
            );
        }
        else {
            logger.info(
                '[UserJourneyExtractor] Using cached navigation graph for "%s"; routes=%d redirects=%d',
                projectRoot,
                compRouteMap.routeMap.routes.length,
                compRouteMap.routeMap.redirections.length
            );
        }

        // Build registry from graph + route map.
        const registry = new UserJourneyRegistryBuilder(
            compRouteMap,
            navGraph,
            fanoutMode
        ).build();

        // Persist each journey into cache for subsequent calls.
        for (const journey of registry.getAll())
            setUserJourney(journey.id, journey);

        logger.info(
            '[UserJourneyExtractor] Cached user journeys for "%s" (count=%d, fanout=%s)',
            projectRoot,
            registry.size(),
            fanoutMode
        );

        return registry;
    }
}