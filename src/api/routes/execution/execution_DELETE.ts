import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as workflowResultStorage from '../../../adapters/storage/workflow-result-storage.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId/workflows/:workflowId/execution', async (req: Request, resp: Response) => {
        
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

            const workflowResults = await workflowResultStorage.getAll(workflowId, storageSession);

            storageSession.beginTransaction();

            for (const workflowResult of workflowResults) {
                await workflowResultStorage.deleteById(workflowResult.workflowId, workflowResult.scenarioId, storageSession);
            }

            storageSession.commit();
            return resp.status(204).json();

        } catch (err: any) {
            storageSession?.rollback();
            logger.error("[DELETE /projects/:projectId/workflows/:workflowId/execution] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to delete workflow execution');
        } finally {
            storageSession?.ends();
        }
    })
}