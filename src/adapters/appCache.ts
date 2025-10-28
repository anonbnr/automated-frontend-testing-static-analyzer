import { AppNavigation } from "../models/navigation-graph.js";
import { UserJourney } from "../models/user-journeys/user-journey-info.js";
import { Scenario } from "../models/scenarios/scenarios-info.js";
import { env } from '../api/env.js';
import logger from "../logging/logger.js";
import { ComponentRouteMap } from "../models/route-info.js";


type ScenarioMap = Map<string, Scenario>;

type JourneyMapValue = {
    journey: UserJourney,
    scenarios: ScenarioMap
}

type analyzeMapValue = {
    compRouteMap: ComponentRouteMap,
    graph: AppNavigation,
    journeys: Map<string, JourneyMapValue>,
    expiresAt: number
}


const analyzes = new Map<string, analyzeMapValue>();

export function getAnalyze(analyzeId: string) {
    const analyze = analyzes.get(analyzeId);
    
    if (analyze && analyze.expiresAt < Date.now()) {
        analyzes.delete(analyzeId);
        return undefined;
    }

    return analyze;
}

function updateExpiration(analyze: analyzeMapValue) {
    analyze.expiresAt = Date.now() + (env.app.cache.TTL_SEC * 1000);
}


// NavigationGraph ACCESSORS

export function getNavigationGraph(analyzeId: string) {
    logger.info('[CACHE] Getting navigation graph from cache for "%s""',
        analyzeId
    );
    return getAnalyze(analyzeId)?.graph;
}

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

// UserJourney ACCESSORS

export function getUserJourney(analyzeId: string, UserJourneyId: string) {
    logger.info('[CACHE] Setting user-journey "%s" into cache for "%s""',
        UserJourneyId,
        analyzeId
    );
    return getAnalyze(analyzeId)?.journeys.get(UserJourneyId)?.journey;
}

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


// Scenario ACCESSORS

export function getScenario(analyzeId: string, UserJourneyId: string, scenarioId: string) { 
    return getAnalyze(analyzeId)?.journeys.get(UserJourneyId)?.scenarios.get(scenarioId);
}

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