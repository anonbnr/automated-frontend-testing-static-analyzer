import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as moduleStorage from '../../../adapters/storage/moduleStorage.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/modules', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const modules = await moduleStorage.getAll(projectId);
            if (modules === undefined ) {
                return resp.status(404).json({ error: "modules not found" });
            }
            
            return resp.json({ modules });

        } catch (err: any) {
            logger.error("[GET /project/:projectId/modules] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get project' });
        }
    })
}