import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/workflows/:workflowId/scenarios/:scenarioId', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const workflowId = Math.trunc(Number(req.params.workflowId));
            const scenarioId = Math.trunc(Number(req.params.scenarioId));

            if (isNaN(workflowId)) {
                return resp.status(404).json("workflow not found");
            }
            if (isNaN(scenarioId)) {
                return resp.status(404).json("scenario not found");
            }
            
            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const scenario = await scenarioStorage.get(projectId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json("scenario not found");
            }

            const workflowScenario = await workflowScenarioStorage.getById(workflowId, scenarioId, storageSession);
            if (workflowScenario === undefined)
                return resp.status(404).json("workflow-scenario not found");

            return resp.json(workflowScenario);

        } catch (err: any) {
            logger.error("[GET /projects/:projectId/workflows/:workflowId/scenarios/:scenarioId] Fatal error: %o", err);
            return resp.status(500).json(err.message || 'Failed to get scenario');
        } finally {
            storageSession?.ends();
        }
    })
}
