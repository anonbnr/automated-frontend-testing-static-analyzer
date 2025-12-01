import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId/scenarios', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;

        const workflowId = Math.trunc(Number(req.params.workflowId));

        if (isNaN(workflowId)) {
            return resp.status(404).json("workflow not found");
        }

        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }
            
            const workflowScenarios = await workflowScenarioStorage.getAll(workflowId, storageSession);

            return resp.json(workflowScenarios);

        } catch (err: any) {
            logger.error("[GET /projects/:projectId/workflows/:workflowId/scenarios] Fatal error: %o", err);
            return resp.status(500).json(err.message || 'Failed to get workflows-scenario');
        } finally {
            storageSession?.ends();
        }
    })
}
