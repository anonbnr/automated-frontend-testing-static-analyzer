import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            let results = await projectStorage.getById(projectId);
            if (results === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            return resp.json(results);

        } catch (err: any) {
            logger.error("[GET /project/:projectId] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get project' });
        }
    })
}