import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as moduleStorage from '../../../adapters/storage/module-storage.js';
import * as componentStorage from '../../../adapters/storage/component-storage.js';
import * as graphStorage from '../../../adapters/storage/graph-storage.js';
import * as redirectRouteStorage from '../../../adapters/storage/redirect-route-storage.js';
import * as routeRoleStorage from '../../../adapters/storage/route-role-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';


export default function buildRoute(router: Router) {

    router.delete('/projects/:projectId/analysis', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;

            const checkProjectId = await projectStorage.getById(projectId, storageSession);
            if (checkProjectId === undefined) {
                return resp.status(404).json("project not found");
            }
            
            await storageSession.beginTransaction();
            
            await Promise.all([
                moduleStorage.deleteByProjectId(projectId, storageSession),
                componentStorage.deleteByProjectId(projectId, storageSession),
                redirectRouteStorage.deleteByProjectId(projectId, storageSession),
                userJourneyStorage.deleteByProjectId(projectId, storageSession),
                graphStorage.deleteByProjectId(projectId, storageSession),
                routeRoleStorage.deleteByProjectId(projectId, storageSession),
            ]);

            await storageSession.commit();
            
            return resp.status(204).json();

        } catch (err: any) {
            await storageSession?.rollback();

            logger.error("[DELETE /project/:projectId/analysis] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to delete analysis');
        } finally {
            storageSession?.ends();
        }
    })
}