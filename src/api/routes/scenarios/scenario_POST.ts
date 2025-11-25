import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';
import { scenarioSchemaPost } from '../schemas/scenarioSchema.js';

import { Scenario } from '../../../models/scenarios/scenarios-info.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';


export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/user-journeys/:journeyId/scenarios', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const journeyId = req.params.journeyId;
        
        const {
            name,
            description
        } = req.body;
        
        const parseResult = scenarioSchemaPost.safeParse({name, description});
        if (!parseResult.success) { 
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }

        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const userJourney = await userJourneyStorage.getById(projectId, journeyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json("user-journey not found");
            }
            
            const scenario: Scenario = {
                userJourneyId: journeyId,
                name: name,
                description: description,
                editedBy: "analyzer",
                status: "draft",
                stepsData: userJourney.expandedSteps?.map(() => ({
                    value: "",
                    usersNote: ""
                })) ?? [],
            }

            const id = await scenarioStorage.save(projectId, journeyId, scenario, storageSession);
            if (id === undefined)
                return resp.status(500).json('Failed to post scenario');

            return resp.status(200).json(id);

        } catch (err: any) {
            logger.error("[POST /projects/:projectId/user-journeys/:journeyId/scenario'] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to post scenario');
        } finally {
            storageSession?.ends();
        }
    })
}
