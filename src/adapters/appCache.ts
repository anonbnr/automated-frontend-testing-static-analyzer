// ──────────────────────────────────────────────────────────────────────────────
// adapters/appCache.ts
//
// Minimal in-memory cache for analysis artifacts, keyed by an analyzeId.
// Items auto-expire based on env.app.cache.TTL_SEC.
//
// Stores, per analyzeId:
//   • compRouteMap  – normalized + deduped route data (for lookups)
//   • graph         – AppNavigation multigraph (nodes/edges/transitions)
//   • journeys      – map of user journeys and their scenarios
//   • expiresAt     – unix ms for TTL eviction
//
// Notes
// -----
// - This cache is process-local; it is *not* shared across processes or hosts.
// - Accessors update TTL on reads that return a live entry or whenever a set*
//   function mutates the analyze entry.
// - Callers should tolerate evictions between calls.
//
// Public API
// ----------
//   getNavigationGraph(analyzeId) → AppNavigation | undefined
//   setNavigationGraph(analyzeId, graph, compRouteMap) → true
//
//   getUserJourney(analyzeId, userJourneyId) → UserJourney | undefined
//   setUserJourney(analyzeId, userJourney) → boolean
//
//   getScenario(analyzeId, userJourneyId, scenarioId) → Scenario | undefined
//   setScenario(analyzeId, userJourneyId, scenario) → boolean
// ──────────────────────────────────────────────────────────────────────────────

import { env } from '../api/env.js';
import logger from '../logging/logger.js';
import { AppNavigation } from "../models/navigation-graph.js";
import { ComponentRouteMap } from '../models/route-info.js';
import { Scenario } from '../models/scenarios/scenarios-info.js';
import { UserJourney } from "../models/user-journeys/user-journey-info.js";

// Per-journey scenario storage
type ScenarioMap = Map<string, Scenario>;

// Per-journey value held inside the analyze record
type JourneyMapValue = {
	journey: UserJourney,
	scenarios: ScenarioMap
}

// Top-level analyze record stored under the analyzeId
type analyzeMapValue = {
	compRouteMap: ComponentRouteMap,
	graph: AppNavigation,
	journeys: Map<string, JourneyMapValue>,
	expiresAt: number // unix ms
}

// Process-local cache
const analyzes = new Map<string, analyzeMapValue>();

/** Internal helper: refresh TTL for a live analyze record. */
function updateExpiration(analyze: analyzeMapValue) {
	analyze.expiresAt = Date.now() + (env.app.cache.TTL_SEC * 1000);
}

/**
 * Lookup analyze record; evicts if expired.
 *
 * @param analyzeId Cache key (e.g., projectRoot).
 * @returns AnalyzeMapValue if live; otherwise undefined.
 */
export function getAnalyze(analyzeId: string) {
	const analyze = analyzes.get(analyzeId);

	if (analyze && analyze.expiresAt < Date.now()) {
		analyzes.delete(analyzeId);
		return undefined;

	}

	return analyze;
}


// ──────────────────────────────────────────────────────────────────────────────
// NavigationGraph ACCESSORS
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Retrieve a cached navigation graph for an analysis.
 */
export function getNavigationGraph(analyzeId: string) {
	logger.info('[CACHE] Getting navigation graph from cache for "%s""',
		analyzeId
	);
	return getAnalyze(analyzeId)?.graph;
}

/**
 * Insert (or replace) the cached navigation graph and its companion route map.
 * Initializes an empty journey map and sets the TTL.
 */
export function setNavigationGraph(analyzeId: string, graph: AppNavigation, compRouteMap: ComponentRouteMap) {
	const analyzeValue = {
		compRouteMap,
		graph,
		journeys: new Map<string, JourneyMapValue>(),
		expiresAt: 0
	};
	updateExpiration(analyzeValue);
	analyzes.set(analyzeId, analyzeValue);

	logger.info('[CACHE] Setting navigation graph into cache for "%s""',
		analyzeId
	);

	return true;
}


// export function hasNavigationGraph(analyzeId: string) {
//     return analyzes.has(analyzeId);
// }

// ──────────────────────────────────────────────────────────────────────────────
// UserJourney ACCESSORS
// ──────────────────────────────────────────────────────────────────────────────

/** Retrieve a user journey by id from a live analyze record. */
export function getUserJourney(analyzeId: string, UserJourneyId: string) {
	logger.info('[CACHE] Setting user-journey "%s" into cache for "%s""',
		UserJourneyId,
		analyzeId
	);
	return getAnalyze(analyzeId)?.journeys.get(UserJourneyId)?.journey;
}

/**
 * Store or replace a user journey in the analyze record, creating the
 * per-journey scenario map if needed.
 *
 * @returns false if analyze record missing; true on success.
 */
export function setUserJourney(analyzeId: string, UserJourney: UserJourney) {
	const analyze = analyzes.get(analyzeId);

	if (analyze === undefined) {
		return false;
	}

	const journeyMapValue = {
		journey: UserJourney,
		scenarios: new Map<string, Scenario>,
	}

	updateExpiration(analyze);
	analyze.journeys.set(UserJourney.id, journeyMapValue);

	logger.info('[CACHE] Setting user-journey "%s" from cache for "%s""',
        UserJourney.id,
        analyzeId
    );
	return true;
}

// export function hasUserJourney(analyzeId: string, UserJourneyId: string) {
//     const analyze = analyzes.get(analyzeId);

//     if (!analyze) {
//         return false;
//     }

//     return (analyze.journeys.has(UserJourneyId));
// }


// ──────────────────────────────────────────────────────────────────────────────
// Scenario ACCESSORS
// ──────────────────────────────────────────────────────────────────────────────

/** Retrieve a scenario by id for a given user journey within an analysis. */
export function getScenario(analyzeId: string, UserJourneyId: string, scenarioId: string) {
	return getAnalyze(analyzeId)?.journeys.get(UserJourneyId)?.scenarios.get(scenarioId);
}

/**
 * Insert or replace a scenario under a specific user journey.
 *
 * @returns false if analyze or journey missing; true on success.
 */
export function setScenario(analyzeId: string, UserJourneyId: string, scenario: Scenario) {
	const analyze = analyzes.get(analyzeId);

	if (analyze === undefined) {
		return false;
	}

	const journey = analyze.journeys.get(UserJourneyId);

	if (journey === undefined) {
		return false;
	}

	updateExpiration(analyze);
	journey.scenarios.set(scenario.id, scenario);

	return true;
}

// export function hasScenario(analyzeId: string, UserJourneyId: string, scenarioId: string) {
//     const analyze = analyzes.get(analyzeId);

//     if (!analyze) {
//         return false;
//     }

//     const journey = analyze.journeys.get(UserJourneyId);

//     if (!journey) {
//         return false;
//     }

//     return journey.scenarios.has(scenarioId);
// }