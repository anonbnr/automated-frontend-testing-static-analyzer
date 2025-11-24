import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import { projectSchemaPost } from '../schemas/projectSchema.js';

import { formatZodErrors } from '../utils/schema.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';
import { Scenario, ScenarioStepData } from '../../../models/scenarios/scenarios-info.js';
import { scenarioSchemaPost } from '../schemas/scenarioSchema.js';
import { workflowSchemaPost } from '../schemas/workflow-schema.js';
import { Workflow } from '../../../models/workflows-info.js';
import { workflowScenarioSchemaPatch, workflowScenarioSchemaPost } from '../schemas/workflow-scenario-schema.js';
import { WorkflowScenario } from '../../../models/workflow-scenario-info.js';

export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/workflows/:workflowId/scenarios', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const workflowId = Math.trunc(Number(req.params.workflowId));
        
        const {
            scenarioId,
        } = req.body;
        
        const parseResult = workflowScenarioSchemaPost.safeParse({workflowId, scenarioId});
        if (!parseResult.success) {
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }

        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "workflow not found" });
            }

            const scenario = await scenarioStorage.get(projectId, scenarioId, storageSession);
            if (scenario === undefined) {
                return resp.status(404).json({ error: "scenario not found" });
            }
            
            const workflowScenario: WorkflowScenario = {
                workflowId: workflowId,
                scenarioId: scenarioId,
            }

            const result = await workflowScenarioStorage.save(workflowScenario, storageSession);
            if (result === false)
                return resp.status(500).json({ error: 'Failed to post workflow-scenario' });

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[POST /projects/:projectId/workflows/:workflowId/scenarios'] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to post workflow-scenario' });
        } finally {
            storageSession?.ends();
        }
    })
}
