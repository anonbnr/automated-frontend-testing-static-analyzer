import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';


export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();
            const projectId = req.params.projectId;

            const checkProjectId = await projectStorage.getById(projectId, storageSession);
            if (checkProjectId === undefined) {
                return resp.status(404).json("project not found");
            }
            
            const results = await projectStorage.deleteById(projectId, storageSession);
            if (results === undefined) {
                return resp.status(500).json('Failed to delete project');
            }
            
            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[DELETE /project/:projectId] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to delete project');
        } finally {
            storageSession?.ends();
        }
    })
}