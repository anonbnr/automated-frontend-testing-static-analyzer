import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';

import { formatZodErrors } from '../utils/schema.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowScenarioStorage from '../../../adapters/storage/workflow-scenario-storage.js';
import { Scenario, ScenarioStepData } from '../../../models/scenarios/scenarios-info.js';
import { workflowScenarioSchemaPatch, workflowScenarioSchemaPost } from '../schemas/workflow-scenario-schema.js';
import { WorkflowScenario } from '../../../models/workflow-scenario-info.js';
import { UserJourney } from '../../../models/user-journeys/user-journey-info.js';

import path from 'path';

import {Builder, Browser, By} from 'selenium-webdriver';


async function execute(scenario: Scenario, userJourney: UserJourney, url: string) {

    if (!userJourney.expandedSteps)
        return;
    
    const route = path.join(url, userJourney.expandedSteps[0].target.id);

    const driver = await new Builder().forBrowser(Browser.CHROME).build();
    
    driver.get(route);
    
    const steps = userJourney.expandedSteps;
    const stepsData = scenario.stepsData;
    const skipSubmit = true;
    try {

        for (let i = 1; i < steps.length; i++) {
            const step = steps[i];
            if (step.target.type === "widget") {
                if (step.meta) {
                    // console.log("");
                    // console.log("Widget: " + step.target.id);

                    
                    const selector: string = step.meta["selectorHint"]; 
                    // console.log("Selector = " + selector);
                    // console.log("   ActionType=" + step.actionType);
                    
                    if (step.actionType === "input" ) {
                        
                        const element = await driver.findElement(By.css(selector));
                        // const tagName: string = await element.getTagName();
                        // console.log("   tagName=" + tagName);

                        const type: string = await element.getAttribute("type");
                        // console.log("       type=" + type);
                        await element.sendKeys("test");
                        
                    }
                    else if (step.actionType === "submit") {
                        // submit
                    }
                    else if (step.actionType === "click") {
                        const element = await driver.findElement(By.css(selector));
                        await element.click();
                    }
                }
            }
        }
    }
    catch (err: any) {
        console.log("Error: " + err.message)
    }
}

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

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const workflow = await workflowStorage.getById(projectId, workflowId, storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const userJourneyMap: Map<string, UserJourney> = new Map();

            const workflowScenarios: WorkflowScenario[] = await workflowScenarioStorage.getAll(workflowId, storageSession)
            for (const workflowScenario of workflowScenarios) {
                const scenario = await scenarioStorage.get(projectId, workflowScenario.scenarioId, storageSession);
                if (!scenario) {
                    throw new Error();
                }

                const userJourneyId = scenario.userJourneyId;
                
                let userJourney = userJourneyMap.get(userJourneyId);

                if (!userJourney) {
                    userJourney = await userJourneyStorage.getById(projectId, userJourneyId, storageSession);
                    if (!userJourney) {
                        throw new Error();
                    }

                    userJourneyMap.set(userJourneyId, userJourney);
                }
                

                execute(scenario, userJourney, project.url);
                break;
            }
            const array = Array.from(userJourneyMap.entries());
            return resp.json({array});

        } catch (err: any) {
            logger.error("[POST /projects/:projectId/workflows/:workflowId/execution'] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to post workflow execution');
        } finally {
            storageSession?.ends();
        }
    })
}
