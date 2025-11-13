/**
 * Adapter for managing storage of the route roles computed during the analysis of the project code.
 */
import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { ComponentInfo, RowComponentInfo } from '../../models/component-info.js';
import { ComponentRouteRole, rowRouteRoles, RouteRoles } from '../../models/route-info.js';

export async function save(projectId : string, roles: Record<ComponentRouteRole, string[]>) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO route_roles (projectId, root, global, shared, mapped, dead)
                VALUES (?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                JSON.stringify(roles.root),
                JSON.stringify(roles.global),
                JSON.stringify(roles.shared),
                JSON.stringify(roles.mapped),
                JSON.stringify(roles.dead),
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: routeRoleSotage.save: ", e);
        return false;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function get(projectId: string): Promise<RouteRoles> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<rowRouteRoles[]>(
            `SELECT root, global, shared, mapped, dead FROM route_roles WHERE projectId = ?`,
            [projectId]
        );
        
        const routeRoles: RouteRoles = {
            root: JSON.parse(results[0].root),
            global: JSON.parse(results[0].global),
            shared: JSON.parse(results[0].shared),
            mapped: JSON.parse(results[0].mapped),
            dead: JSON.parse(results[0].dead),
        }
        return routeRoles;
    } catch(e) {
        console.log("Error: routeRoleSotage.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}
