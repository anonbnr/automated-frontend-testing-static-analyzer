import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';
import { scenarioSchemaPatch } from '../schemas/scenarioSchema.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';


export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId/user-journeys/:journeyId/scenarios/:scenarioId', async (req: Request, resp: Response) => {
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const userJourneyId = req.params.journeyId;
        const scenarioId = req.params.scenarioId;

        const {
            name,
            description,
            editedBy,
            tags,
            status,
            stepsData,
            expectedResult,
        } = req.body;

        const parseResult = scenarioSchemaPatch.safeParse({name, description, editedBy, tags, status, stepsData, expectedResult});
        if (!parseResult.success) { 
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }
        
        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const userJourney = await userJourneyStorage.getById(projectId, userJourneyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json("user-journey not found");
            }
            
            const scenario = await scenarioStorage.getById(projectId, userJourneyId, Math.trunc(Number(scenarioId)), storageSession);
            if (scenario === undefined) {
                return resp.status(404).json("scenario not found");
            }

            let newStepsData = undefined;
            if (stepsData) {
                newStepsData = scenario.stepsData;
                for (const stepData of stepsData) {
                    const {index, ...newStep} = stepData;
                    Object.assign(newStepsData[index], newStep);
                }
            }

            const data = {
                name,
                description,
                editedBy,
                tags: JSON.stringify(tags),
                status,
                stepsData: JSON.stringify(newStepsData),
                expectedResult: JSON.stringify(expectedResult)
            }

            const result = await scenarioStorage.update(projectId, userJourneyId, Math.trunc(Number(scenarioId)), data, storageSession);
            if (result === undefined) {
                return resp.status(500).json('Failed to patch scenario');
            }

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[PATCH /projects/:projectId/user-journeys/:journeyId/scenarios/:scenarioId] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to patch scenario');
        } finally {
            storageSession?.ends();
        }
    })
}
