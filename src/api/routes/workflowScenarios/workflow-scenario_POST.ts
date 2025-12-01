import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';
import { workflowScenarioSchemaPost } from '../schemas/workflow-scenario-schema.js';

import { WorkflowScenario } from '../../../models/workflow-scenario-info.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';


export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/workflows/:workflowId/scenarios', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const workflowId = Math.trunc(Number(req.params.workflowId));

        if (isNaN(workflowId)) {
                return resp.status(404).json("workflow not found");
        }
        
        const {
            scenarioId,
        } = req.body;
        
        const parseResult = workflowScenarioSchemaPost.safeParse({workflowId, scenarioId});
        if (!parseResult.success) {
            return resp.status(400).json(formatZodErrors(parseResult.error));
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

            const scenario = await scenarioStorage.get(projectId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json("scenario not found");
            }

            let workflowScenario = await workflowScenarioStorage.getById(workflowId, scenarioId, storageSession);
            if (workflowScenario !== undefined) {
                return (resp.status(409).json("scenario already exists for this workflow"));
            }
            
            workflowScenario = {
                workflowId: workflowId,
                scenarioId: scenarioId,
            }

            await workflowScenarioStorage.save(workflowScenario, storageSession);

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[POST /projects/:projectId/workflows/:workflowId/scenarios'] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to post workflow-scenario');
        } finally {
            storageSession?.ends();
        }
    })
}
