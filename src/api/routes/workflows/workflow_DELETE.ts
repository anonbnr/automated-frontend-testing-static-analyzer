import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId/workflows/:workflowId', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const workflowId = req.params.workflowId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }
            
            const workflow = await workflowStorage.getById(projectId, Math.trunc(Number(workflowId)), storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }
            
            const results = await workflowStorage.deleteById(projectId, Math.trunc(Number(workflowId)), storageSession);
            if (results === undefined) {
                return resp.status(500).json("Failed to delete workflow");
            }
            
            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[DELETE /projects/:projectId/workflows/:workflowId] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || "Failed to delete workflow");
        } finally {
            storageSession?.ends();
        }
    })
}