import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { RedirectRoute, RowRedirectRoute } from '../../models/route-info.js';


export async function save(projectId : string, redirectRoute : RedirectRoute, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
            `INSERT INTO redirect_routes (projectId, route, module, redirectTo, pathMatch)
                VALUES (?, ?, ?, ?, ?)`,
            [
                projectId,
                redirectRoute.route,
                redirectRoute.module,
                redirectRoute.redirectTo,
                redirectRoute.pathMatch,
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: redirectRouteStorage.save: ", e);
        throw e;
    }
}

export async function getAll(projectId: string, storageSession: StorageSession): Promise<RedirectRoute[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowRedirectRoute[]>(
            `SELECT route, module, redirectTo, pathMatch FROM redirect_routes WHERE projectId=?`,
            [projectId]
        );

        const redirectRoutes: RedirectRoute[] = [];
        let redirectRoute: RedirectRoute;
        
        for (const result of results) {
            redirectRoute = {
                route: result.route,
                module: result.module,
                redirectTo: result.redirectTo,
                pathMatch: result.pathMatch
            }
            redirectRoutes.push(redirectRoute)
        }

        return redirectRoutes;
    } catch(e) {
        logger.error("Error: redirectRouteStorage.getAll: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
            `DELETE FROM redirect_routes WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch(e) {
        logger.error("Error: redirectRouteStorage.getByProjectId: ", e);
        throw e;
    }
}