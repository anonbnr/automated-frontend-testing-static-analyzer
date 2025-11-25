import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as moduleStorage from '../../../adapters/storage/module-storage.js';


export default function buildRoute(router: Router) {
    
    router.get('/projects/:projectId/modules', async (req: Request, resp: Response) => {
        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();
            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json("project not found");
            }

            const modules = await moduleStorage.getAll(projectId, storageSession);
            if (modules === undefined ) {
                return resp.status(404).json("modules not found");
            }

            return resp.json(modules);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/modules] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to get modules');
        } finally {
            storageSession?.ends;
        }
    })
}