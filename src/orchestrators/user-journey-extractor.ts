// src/orchestrators/user-journey-extractor.ts
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
    async extract(options: ExtractOptions = {}): Promise<UserJourneyRegistry> {
        const { fanoutMode = "primary" } = options;

        // 1) build the navigation multigraph via static analysis
        const navGraph = await this.staticAnalyzer.analyze();

        // 2) assemble + process user journeys
        return new UserJourneyRegistryBuilder(
            this.staticAnalyzer.compRouteMap,
            navGraph,
            fanoutMode
        ).build();
    }
}