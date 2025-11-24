import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId/user-journeys/:journeyId/scenarios/:scenarioId', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const userJourneyId = req.params.journeyId;
            const scenarioId = req.params.scenarioId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const userJourney = await userJourneyStorage.getById(projectId, userJourneyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json({ error: "user-journey not found" });
            }
            
            const scenario = await scenarioStorage.getById(projectId, userJourneyId, Math.trunc(Number(scenarioId)), storageSession);
            if (scenario === undefined) {
                return resp.status(404).json({ error: "scenario not found" });
            }
            
            const results = await scenarioStorage.deleteById(projectId, userJourneyId, Math.trunc(Number(scenarioId)), storageSession);
            if (results === undefined) {
                return resp.status(500).json({ error: 'Failed to delete scenario' });
            }
            
            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[DELETE /projects/:projectId/user-journeys/:journeyId/scenarios] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to delete scenario' });
        } finally {
            storageSession?.ends();
        }
    })
}