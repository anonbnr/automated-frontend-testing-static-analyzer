import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { serialize } from 'v8';
import { formatZodErrors } from '../utils/schema.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';
import { scenarioSchemaPatch } from '../schemas/scenarioSchema.js';

export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId/workflows/:workflowId/scenarios/:scenarioId', async (req: Request, resp: Response) => {
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const workflowId = Math.trunc(Number(req.params.workflowId));
        const scenarioId = Math.trunc(Number(req.params.scenarioId));

        const {
            order,
        } = req.body;

        const parseResult = scenarioSchemaPatch.safeParse({order});
        if (!parseResult.success) { 
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }
        
        try {
            storageSession = await storageManager.getSession();
            storageSession.beginTransaction();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json({ error: "workflow not found" });
            }

            const scenario = await scenarioStorage.get(projectId, workflowId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json({ error: "scenario not found" });
            }

            const result = await workflowScenarioStorage.update(workflowId, scenarioId, order, storageSession);
            if (result === false) {
                storageSession.rollback();
                return resp.status(500).json({ error: 'Failed to patch workflow-scenario' });
            }

            storageSession.commit();

            return resp.status(204).json();

        } catch (err: any) {
            storageSession?.rollback();
            logger.error("[PATCH /projects/:projectId/workflows/:workflowId/scenarios/:scenarioId] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to patch workflow-scenario' });
        } finally {
            storageSession?.ends();
        }
    })
}
