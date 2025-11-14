import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as userJourneys from '../../../adapters/storage/userJourneyStorage.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/user-journeys', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const userjourneys = await userJourneys.getAll(projectId);
            if (userJourneys === undefined ) {
                return resp.status(404).json({ error: "userJourneys not found" });
            }
            
            return resp.json({ userJourneys });

        } catch (err: any) {
            logger.error("[GET /project/:projectId/user-journeys] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get userjourneys' });
        }
    })
}