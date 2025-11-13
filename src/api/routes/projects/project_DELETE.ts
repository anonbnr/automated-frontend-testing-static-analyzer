import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            const checkProjectId = await projectStorage.getById(projectId);
            if (checkProjectId === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const results = await projectStorage.deleteById(projectId);
            if (results === undefined) {
                return resp.status(500).json({ error: 'Failed to delete project' });
            }
            
            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[DELETE /project/:projectId] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to delete project' });
        }
    })
}