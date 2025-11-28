import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }
            
            const workflows = await workflowStorage.getAll(projectId, storageSession);

            return resp.json(workflows);

        } catch (err: any) {
            logger.error("[GET /projects/:projectId/workflows] Fatal error: %o", err);
            return resp.status(500).json(err.message || "Failed to get workflows");
        } finally {
            storageSession?.ends();
        }
    })
}
