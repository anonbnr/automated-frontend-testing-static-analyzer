import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';

export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId/workflows/:workflowId/scenarios/:scenarioId', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();
            storageSession.beginTransaction();

            const projectId = req.params.projectId;
            const workflowId = Math.trunc(Number(req.params.workflowId));
            const scenarioId = Math.trunc(Number(req.params.scenarioId));

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json({ error: "workflow not found" });
            }

            const scenario = await scenarioStorage.get(projectId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json({ error: "scenario not found" });
            }

            const workflowScenario = await workflowScenarioStorage.getById(workflowId, scenarioId, storageSession);
            if (workflowScenario === undefined) {
                return resp.status(404).json({ error: "workflow-scenario not found" });
            }
            const results = await workflowScenarioStorage.deleteById(workflowScenario, storageSession);
            if (results === false) {
                storageSession.rollback();
                return resp.status(500).json({ error: 'Failed to delete workflow-scenario' });
            }
            
            storageSession.commit();
            return resp.status(204).json();

        } catch (err: any) {
            storageSession?.rollback();
            logger.error("[DELETE /projects/:projectId/workflows/:workflowId/scenarios/:scenarioId] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to delete workflow-scenarios' });
        } finally {
            storageSession?.ends();
        }
    })
}