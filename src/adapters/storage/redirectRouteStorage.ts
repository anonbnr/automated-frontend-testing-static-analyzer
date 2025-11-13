import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { RedirectRoute, RowRedirectRoute } from '../../models/route-info.js';

export async function save(projectId : string, redirectRoute : RedirectRoute) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
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
        return false;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getAll(projectId: string): Promise<RedirectRoute[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
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
        console.log("Error: redirectRouteStorage.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}