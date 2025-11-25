import { Request, Response, Router } from 'express';

import { makeWidgetsTree } from '../utils/widgets.js';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId/execution', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            // const projectId = req.params.projectId;
            // const workflowId = Math.trunc(Number(req.params.workflowId));
            
            // const project = await projectStorage.getById(projectId, storageSession);
            // if (project === undefined) {
            //     return resp.status(404).json({ error: "project not found" });
            // }

            // const workflow = await workflowStorage.getById(projectId, Math.trunc(Number(workflowId)), storageSession);
            // if (workflow === undefined) {
            //     return resp.status(404).json({ error: "workflow not found" });
            // }

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[GET /projects/:projectId/workflows/:workflowId/execution] Fatal error: %o", err);
            return resp.status(500).json(err.message || 'Failed to get workflow execution');
        } finally {
            storageSession?.ends();
        }
    })
}
