import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';
import * as workflowResultStorage from '../../../adapters/storage/workflow-result-storage.js';

import { UserJourney } from '../../../models/user-journeys/user-journey-info.js';
import { WorkflowScenario } from '../../../models/workflow-scenario-info.js';

import { workflowScenarioSchemaPost } from '../schemas/workflow-scenario-schema.js';

import { executeSelenium } from '../../../adapters/selenium.js';
import { WorkflowResult } from '../../../models/workflow-result.js';


export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/workflows/:workflowId/execution', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const workflowId = Math.trunc(Number(req.params.workflowId));
        
        const {
            scenarioId,
        } = req.body;
        
        const parseResult = workflowScenarioSchemaPost.safeParse({workflowId, scenarioId});
        if (!parseResult.success) {
            return resp.status(400).json(formatZodErrors(parseResult.error));
        }

        try {
            storageSession = await storageManager.getSession();
            storageSession.beginTransaction();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined || workflow.id === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const userJourneyMap: Map<string, UserJourney> = new Map();

            const workflowScenarios: WorkflowScenario[] = await workflowScenarioStorage.getAll(workflowId, storageSession)
            let workflowResults: WorkflowResult[] = await workflowResultStorage.getAll(workflowId, storageSession);
            if (workflowResults.length !== 0) {
                for (const workflowResult of workflowResults) {
                    await workflowResultStorage.deleteById(workflowResult.workflowId, workflowResult.scenarioId,  storageSession);
                }
                workflowResults = [];
            }
            
            for (const workflowScenario of workflowScenarios) {
                const scenario = await scenarioStorage.get(projectId, workflowScenario.scenarioId, storageSession);
                if (scenario === undefined || scenario.id === undefined) {
                    storageSession.rollback();
                    return resp.status(404).json("scenario not found");
                }

                const userJourneyId = scenario.userJourneyId;
                
                let userJourney = userJourneyMap.get(userJourneyId);

                if (!userJourney) {
                    userJourney = await userJourneyStorage.getById(projectId, userJourneyId, storageSession);
                    if (!userJourney) {
                        storageSession.rollback();
                        return resp.status(404).json("userJourney not found");
                    }

                    userJourneyMap.set(userJourneyId, userJourney);
                }
                
                try {
                    const result = await executeSelenium(scenario, userJourney, project.url);
                    if (result === true) {
                        workflowResultStorage.save({
                        workflowId: workflow.id,
                        scenarioId: scenario.id,
                        success: true,
                    }, storageSession);
                    }
                } catch (err: any) {
                    workflowResultStorage.save({
                        workflowId: workflow.id,
                        scenarioId: scenario.id,
                        success: false,
                        message: err.message
                    }, storageSession);
                }
                
            }

            // TODO add a route to check workflow status url
            return resp.status(202).json({message: "Workflow accepted for processing, can check execution status at the workflowStatusUrl", workfloStatusUrl: "url/:projectId/workflows/:workflowId/execution/status"});

        } catch (err: any) {
            storageSession?.rollback();
            logger.error("[POST /projects/:projectId/workflows/:workflowId/execution'] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to post workflow execution');
        } finally {
            storageSession?.ends();
        }
    })
}
