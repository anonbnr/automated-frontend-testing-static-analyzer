import { AppNavigation } from "../models/navigation-graph.js";
import { UserJourney } from "../models/user-journeys/user-journey-info.js";
import { Scenario } from "../models/scenarios/scenarios-info.js";
import { env } from '../api/env.js';
import logger from "../logging/logger.js";
import { ComponentRouteMap } from "../models/route-info.js";
import { StageAction } from "../models/scenarios/stage-action.js";


type ScenarioMap = Map<string, Scenario>;

type JourneyMapValue = {
    journey: UserJourney,
    stageActions: StageAction[],
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
        logger.info('analyze "%s" expired, deleting analyze', analyzeId);
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


// UserJourney ACCESSORS

export function getUserJourney(analyzeId: string, userJourneyId: string) {
    logger.info('[CACHE] Getting user-journey "%s" from cache for "%s""',
        userJourneyId,
        analyzeId
    );
    return getAnalyze(analyzeId)?.journeys.get(userJourneyId)?.journey;
}

export function setUserJourney(analyzeId: string, UserJourney: UserJourney) {
    const analyze = analyzes.get(analyzeId);

    if (analyze === undefined) {
        logger.info('[CACHE] setUserJourney failed: analyze "%s" does not exist', analyzeId);
        return false;
    }

    const journeyMapValue = {
        journey: UserJourney,
        stageActions: [],
        scenarios: new Map<string, Scenario>(),
    }

    updateExpiration(analyze);
    analyze.journeys.set(UserJourney.id, journeyMapValue);

    logger.info('[CACHE] Setting user-journey "%s" from cache for "%s""',
        UserJourney.id,
        analyzeId
    );
    return true;
}


// Scenario ACCESSORS

export function getScenario(analyzeId: string, userJourneyId: string, scenarioId: string) {
    return getAnalyze(analyzeId)?.journeys.get(userJourneyId)?.scenarios.get(scenarioId);
}

export function setScenario(analyzeId: string, userJourneyId: string, scenario: Scenario) {
    const analyze = analyzes.get(analyzeId);

    if (analyze === undefined) {
        logger.info('[CACHE] setScenario failed: analyze "%s" does not exist', analyzeId);
        return false;
    }

    const journey = analyze.journeys.get(userJourneyId);

    if (journey === undefined) {
        logger.info('[CACHE] setScenario: user-journey "%s" does not exist', userJourneyId);
        return false;
    }

    updateExpiration(analyze);
    journey.scenarios.set(scenario.id, scenario);

    return true;
}


// StageActions ACCESSORS

export function getStageActions(analyzeId: string, userJourneyId: string) {
    logger.info('[CACHE] Getting stage-actions for user-journey "%s" from cache for "%s""',
        userJourneyId,
        analyzeId
    );
    return getAnalyze(analyzeId)?.journeys.get(userJourneyId)?.stageActions;
}

export function setStageActions(analyzeId: string, userJourneyId: string, stageActions: StageAction[]) {
    const analyze = analyzes.get(analyzeId);

    if (analyze === undefined) {
        logger.info('[CACHE] setStageActions failed: analyze "%s" does not exist', analyzeId);
        return false;
    }

    const journey = analyze.journeys.get(userJourneyId);

    if (journey === undefined) {
        logger.info('[CACHE] setStageActions failed: user-journey "%s" does not exist', userJourneyId);
        return false;
    }

    journey.stageActions = stageActions;

    updateExpiration(analyze);
    
    logger.info('[CACHE] Setting stage-actions from cache for user-journey "%s" into for "%s""',
        userJourneyId,
        analyzeId
    );

    return true;
}