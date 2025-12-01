import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';

import { RouteRoles } from '../../../models/route-info.js';

import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as componentRouteStorage from '../../../adapters/storage/component-route-storage.js';
import * as redirectRouteStorage from '../../../adapters/storage/redirect-route-storage.js';
import * as routeRoleStorage from '../../../adapters/storage/route-role-storage.js';


export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/routes', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const componentRoutes = await componentRouteStorage.getAll(projectId, storageSession);
            const redirectRoutes = await redirectRouteStorage.getAll(projectId, storageSession);
            const routeRoles = await routeRoleStorage.getAll(projectId, storageSession);

            const routeMap = {
                routes: componentRoutes,
                redirections: redirectRoutes,
                roles: routeRoles
            }

            return resp.json(routeMap);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/routes] Fatal error: %o", err);
            return resp
                .status(500)
                .json(err.message || 'Failed to get routes');
        } finally {
            storageSession?.ends();
        }
    })
}