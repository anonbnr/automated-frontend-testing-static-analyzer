/**
 * Adapter for managing storage of the route roles computed during the analysis of the project code.
 */
import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { ComponentRouteRole, rowRouteRoles, RouteRoles } from '../../models/route-info.js';


export async function save(projectId : string, roles: Record<ComponentRouteRole, string[]>, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
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
        throw e;
    }
}

export async function getAll(projectId: string, storageSession: StorageSession): Promise<RouteRoles> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<rowRouteRoles[]>(
            `SELECT root, global, shared, mapped, dead FROM route_roles WHERE projectId = ?`,
            [projectId]
        );
        if (results.length === 0) {
            throw new Error("Error: routeRoleStorage.get: no ");
        }
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
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
            `DELETE FROM route_roles WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch(e) {
        console.log("Error: routeRoleStorage.getByProjectId: ", e);
        throw e;
    }
}