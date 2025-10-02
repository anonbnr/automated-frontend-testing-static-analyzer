// src/orchestrators/scenario-extractor.ts
/**
 * ScenarioExtractor
 * =================
 * Orchestrates the end-to-end pipeline to produce a ScenarioRegistry:
 *   1) Runs the static analyzer to build the navigation multigraph.
 *   2) Uses ScenarioRegistryBuilder to assemble + process scenarios.
 *
 * Notes
 * -----
 * - The extractor is intentionally thin and side-effect free.
 * - It accepts fanout behavior so callers can choose "primary" vs "collapse".
 */

import { FanoutMode } from "../builders/scenarios/scenario-processors.js";
import { ScenarioRegistryBuilder } from "../builders/scenarios/scenario-registry-builder.js";
import { ScenarioRegistry } from "../models/scenarios/scenario-info.js";
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

export class ScenarioExtractor {

    private staticAnalyzer: StaticAnalyzer;

    /**
    * @param tsConfigPath Absolute path to the project's tsconfig.json
    */
    constructor(private tsConfigPath: string) {
        this.staticAnalyzer = new StaticAnalyzer(this.tsConfigPath);
    }

    /**
    * Run the pipeline and return a ScenarioRegistry.
    *
    * @param options Extraction options (fanout mode, reserved knobs)
    */
    async extract(options: ExtractOptions = {}): Promise<ScenarioRegistry> {
        const { fanoutMode = "primary" } = options;

        // 1) build the navigation multigraph via static analysis
        const navGraph = await this.staticAnalyzer.analyze();

        // 2) assemble + process scenarios
        return new ScenarioRegistryBuilder(
            this.staticAnalyzer.compRouteMap,
            navGraph,
            fanoutMode
        ).build();
    }
}