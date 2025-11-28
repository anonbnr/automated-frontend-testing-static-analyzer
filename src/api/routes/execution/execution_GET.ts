import logger from '../../../logging/logger.js';
import { Request, Response, Router } from 'express';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as workflowResultStorage from '../../../adapters/storage/workflow-result-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId/execution', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const workflowId = Math.trunc(Number(req.params.workflowId));
            
            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const workflowScenarios = await workflowScenarioStorage.getAll(workflowId, storageSession);

            const workflowResults = await workflowResultStorage.getAll(workflowId, storageSession);
            
            if (workflowScenarios.length !== workflowResults.length) {
                return resp.status(206).json(workflowResults);
            }
            else {
                return resp.status(200).json(workflowResults);
            }
            

        } catch (err: any) {
            logger.error("[GET /projects/:projectId/workflows/:workflowId/execution] Fatal error: %o", err);
            return resp.status(500).json(err.message || 'Failed to get workflow execution');
        } finally {
            storageSession?.ends();
        }
    })
}
