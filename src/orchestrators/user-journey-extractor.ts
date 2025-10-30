// orchestrators/user-journey-extractor.ts
/**
 * UserJourneyExtractor
 * =================
 * Orchestrates the end-to-end pipeline to produce a UserJourneyRegistry:
 *   1) Runs the static analyzer to build the navigation multigraph.
 *   2) Uses UserJourneyRegistryBuilder to assemble + process user journeys.
 *
 * Notes
 * -----
 * - The extractor is intentionally thin and side-effect free.
 * - It accepts fanout behavior so callers can choose "primary" vs "collapse".
 */

import { FanoutMode } from "../builders/user-journeys/user-journey-processors.js";
import { UserJourneyRegistryBuilder } from "../builders/user-journeys/user-journey-registry-builder.js";
import { UserJourneyRegistry } from "../models/user-journeys/user-journey-info.js";
import { StaticAnalyzer } from "./static-analyzer.js";
import * as appCache from "../adapters/appCache.js";
import logger from "../logging/logger.js";

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
    * @param options Extraction options (fanout mode, reserved knobs)
    */
    async extract(options: ExtractOptions = {}, projectRoot: string): Promise<UserJourneyRegistry> {
        const { fanoutMode = "primary" } = options;

        // 1) build the navigation multigraph via static analysis
        const analyze = appCache.getAnalyze(projectRoot);

        let registry = undefined;
        const journeys = analyze?.journeys;
        if (journeys && journeys.size !== 0) {
            registry = new UserJourneyRegistry();
            
            for (const journeyValue of journeys.values()) {
                registry.add(journeyValue.journey);
            }
            logger.info('[POST /user-journeys] Getting user-journeys from cache for "%s"',
                projectRoot
            );
        }
        else {
            let navGraph = analyze?.graph;

            let compRouteMap = analyze?.compRouteMap;
            
            if (navGraph === undefined || compRouteMap === undefined) {
                navGraph = await this.staticAnalyzer.analyze();
                compRouteMap = this.staticAnalyzer.compRouteMap;
                appCache.setNavigationGraph(projectRoot, navGraph, compRouteMap);
                logger.info('[POST /user-journeys] Setting navigation graph into cache for "%s", routeMap = "%s"',
                    projectRoot,
                    this.staticAnalyzer.compRouteMap
                );
            }
            else {
                logger.info('[POST /user-journeys] Getting navigation graph from cache for "%s", routeMap = "%s"',
                    projectRoot,
                    this.staticAnalyzer.compRouteMap
                );
            }

            registry = new UserJourneyRegistryBuilder(
                compRouteMap,
                navGraph,
                fanoutMode
            ).build();

            for (const journey of registry.getAll()) {
                appCache.setUserJourney(projectRoot, journey);
                logger.info('[POST /user-journeys] Setting user-journey "%s" into cache for "%s"',
                    journey.id,
                    projectRoot
                );
            }

        }
        
        // 2) assemble + process user journeys
        return registry;
    }

}

