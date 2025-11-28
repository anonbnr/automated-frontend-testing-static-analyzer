import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


import TtlCache from '../../../llm/cache.js';
import { makeLlmProvider } from '../../../llm/factory.js';
import { llmGate } from '../../../llm/gate.js';
import { makeRateLimiter } from '../../../llm/rate-limit.js';
import { RefineJourneysRequestSchema, UserJourney } from '../../../llm/schemas.js';
import { JourneysRefinerService } from '../../../llm/services/journeys-refiner.service.js';
import { sha1Hex, stableStringify } from '../../../llm/utils.js';
import { env } from '../../env.js';
import { rid } from '../../utils.js';
import { completion } from '../../../llm/services/scenario-completion.js';



export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId/scenarios/:scenarioId/llm-completion', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const userJourney: UserJourney | undefined = undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const workflowId = Math.trunc(Number(req.params.workflowId));
            const scenarioId = Math.trunc(Number(req.params.scenarioId));
            
            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const scenario = await scenarioStorage.get(projectId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json("scenario not found");
            }

            const userJourney = await userJourneyStorage.getById(projectId, scenario.userJourneyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json("userJourney not found");
            }

            const result = await completion(userJourney)

            return resp.json(result);
    
        } catch (err: any) {
            // Distinguish validation vs. provider/timeout errors
            const msg = String(err?.message || err);
            return resp.status(500).json("LLM ERROR: " + msg);
        } finally {
            storageSession?.ends();
        }
    })
}
