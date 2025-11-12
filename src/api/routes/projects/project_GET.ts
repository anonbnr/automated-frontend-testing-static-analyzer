import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId', async (req: Request, res: Response) => {

        try {
            const projectId = req.params.projectId;

            let results = await projectRegistry.getById(projectId);
            if (results === undefined) {
                return res.status(404).json({ error: "project not found" });
            }
            
            return res.json({ results });

        } catch (err: any) {
            logger.error("[GET /project/:projectId] Fatal error: %o", err);
            return res
                .status(500)
                .json({ error: err.message || 'Failed to get project' });
        }
    })
}