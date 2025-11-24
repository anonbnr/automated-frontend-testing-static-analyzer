import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import { projectSchemaPost } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../utils/schema.js';
import { Scenario, ScenarioStepData } from '../../../models/scenarios/scenarios-info.js';
import { scenarioSchemaPost } from '../schemas/scenarioSchema.js';
import { workflowSchemaPost } from '../schemas/workflow-schema.js';
import { Workflow } from '../../../models/workflows-info.js';

export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/workflows', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        
        const {
            name,
            description
        } = req.body;
        
        const parseResult = workflowSchemaPost.safeParse({name, description});
        if (!parseResult.success) { 
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }

        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const workflow: Workflow = {
                name: name,
                description: description,
            }

            const id = await workflowStorage.save(projectId, workflow, storageSession);
            if (id === undefined)
                return resp.status(500).json({ error: 'Failed to post workflow' });

            return resp.status(200).json(id);

        } catch (err: any) {
            logger.error("[POST /projects/:projectId/workflows'] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to post workflow' });
        } finally {
            storageSession?.ends();
        }
    })
}
