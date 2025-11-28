import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';
import { scenarioSchemaPatch } from '../schemas/scenarioSchema.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as workflowStorage from '../../../adapters/storage/workflow-storage.js';


export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId/workflows/:workflowId', async (req: Request, resp: Response) => {
        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const workflowId = req.params.workflowId;

        const {
            name,
            description,
        } = req.body;

        const parseResult = scenarioSchemaPatch.safeParse({name, description});
        if (!parseResult.success) { 
            return resp.status(400).json(formatZodErrors(parseResult.error));
        }
        
        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }
            
            const workflow = await workflowStorage.getById(projectId, Math.trunc(Number(workflowId)), storageSession);
            if (workflow === undefined) {
                return resp.status(404).json("workflow not found");
            }

            const data = {
                name,
                description,
            }

            const result = await workflowStorage.update(projectId, Math.trunc(Number(workflowId)), data, storageSession);
            if (result === undefined) {
                return resp.status(500).json("Failed to patch workflow");
            }

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[PATCH /projects/:projectId/workflows/:workflowId] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || "Failed to patch workflow");
        } finally {
            storageSession?.ends();
        }
    })
}
