import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as componentRouteStorage from '../../../adapters/storage/componentRouteStorage.js';
import * as redirectRouteStorage from '../../../adapters/storage/redirectRouteStorage.js';
import * as routeRoleStorage from '../../../adapters/storage/routeRoleStorage.js';
import { ComponentRouteMap, RouteMap, RouteRoles } from '../../../models/route-info.js';
import { ComponentInfo } from '../../../models/component-info.js';

export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/routes', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const componentRoutes = await componentRouteStorage.getAll(projectId);
            if (componentRoutes === undefined ) {
                return resp.status(404).json({ error: "componentRoutes not found" });
            }

            const redirectRoutes = await redirectRouteStorage.getAll(projectId);
            if (redirectRoutes === undefined ) {
                return resp.status(404).json({ error: "redirectRoutes not found" });
            }

            const routeRoles: RouteRoles = await routeRoleStorage.get(projectId);
            if (routeRoles === undefined ) {
                return resp.status(404).json({ error: "routeRoles not found" });
            }

            const routeMap = {
                routes: componentRoutes,
                redirections: redirectRoutes,
                roles: routeRoles
            }
            
            return resp.json( routeMap );

        } catch (err: any) {
            logger.error("[GET /project/:projectId/modules] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get project' });
        }
    })
}