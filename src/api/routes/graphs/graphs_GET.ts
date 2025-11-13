import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as graphStorage from '../../../adapters/storage/graphStorage.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/graphs', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const graphs = await graphStorage.getAll(projectId);
            if (graphs === undefined ) {
                return resp.status(404).json({ error: "graphs not found" });
            }
            
            return resp.json(graphs);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/graphs] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get graphs' });
        }
    })
}