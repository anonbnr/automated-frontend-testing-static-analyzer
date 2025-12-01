import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { formatZodErrors } from '../utils/schema.js';
import { projectSchemaPatch } from '../schemas/projectSchema.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';


export default function buildRoute(router: Router) {

    
    router.patch('/projects/:projectId', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const { name, description, projectRoot, url } = req.body as { name: string, description: string, projectRoot: string, url: string }
        const projectId = req.params.projectId;
        
        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            if (!name && !description && !projectRoot && !url) {
                return resp.status(204).json();
            }

            const parseResult = projectSchemaPatch.safeParse({name, description, projectRoot, url});
            if (!parseResult.success) { 
                return resp.status(400).json(formatZodErrors(parseResult.error));
            }

            await projectStorage.update(projectId, name, description, projectRoot, url, storageSession);

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[PATCH /project/:projectId] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to patch project');
        } finally {
            storageSession?.ends();
        }
    })
}