import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId', async (req: Request, res: Response) => {

        try {
            const projectId = req.params.projectId;

            const checkProjectId = await projectRegistry.getById(projectId);
            if (checkProjectId === undefined) {
                return res.status(404).json({ error: "project not found" });
            }
            
            const results = await projectRegistry.deleteById(projectId);
            if (results === undefined) {
                return res.status(500).json({ error: 'Failed to delete project' });
            }
            
            return res.status(204).json();

        } catch (err: any) {
            logger.error("[DELETE /project/:projectId] Fatal error: %o", err);
            return res
                .status(500)
                .json({ error: err.message || 'Failed to delete project' });
        }
    })
}