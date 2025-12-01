import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/user-journeys/:journeyId/scenarios/:scenarioId', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const userJourneyId = req.params.journeyId;
            const scenarioId = Math.trunc(Number(req.params.scenarioId));

            if (isNaN(scenarioId)) {
                return resp.status(404).json("scenario not found");
            }

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const userJourney = await userJourneyStorage.getById(projectId, userJourneyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json("user-journey not found");
            }
            
            const scenario = await scenarioStorage.getById(projectId, userJourneyId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json("scenario not found");
            }

            return resp.json(scenario);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/components/:componentId/widget-ids] Fatal error: %o", err);
            return resp.status(500).json(err.message || 'Failed to get widget-ids');
        } finally {
            storageSession?.ends();
        }
    })
}
