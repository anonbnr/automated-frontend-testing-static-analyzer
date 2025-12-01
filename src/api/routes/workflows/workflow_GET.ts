import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';


// Auto-loaded function (in index.ts loadAndBuildRoutes()) for building route
export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const workflowId = Math.trunc(Number(req.params.workflowId));

            if (isNaN(workflowId)) {
                return resp.status(404).json("workflow not found");
            }

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }
            
            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            return resp.json(workflow);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/workflows/:workflowId] Fatal error: %o", err);
            return resp.status(500).json(err.message || "Failed to get workflows");
        } finally {
            storageSession?.ends();
        }
    })
}
