/**
 * Adapter for managing storage of the component routes.
 */
import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { ComponentRoute, RowComponentRoute } from '../../models/route-info.js';
import { union } from 'zod';

export async function save(projectId : string, componentRoute : ComponentRoute) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO component_routes (projectId, route, module, component, loadChildren, loadComponent, pathMatch, canActivate, canActivateChild, canLoad, resolve, data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                componentRoute.route,
                componentRoute.module,
                componentRoute.component,
                componentRoute.loadChildren,
                componentRoute.loadComponent,
                componentRoute.pathMatch,
                JSON.stringify(componentRoute.canActivate),
                JSON.stringify(componentRoute.canActivateChild),
                JSON.stringify(componentRoute.canLoad),
                JSON.stringify(componentRoute.resolve),
                JSON.stringify(componentRoute.data),
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: componentRouteStorage.save: ", e);
        return false;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getAll(projectId: string): Promise<ComponentRoute[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<RowComponentRoute[]>(
            `SELECT route, module, component, loadChildren, loadComponent, pathMatch, canActivate, canActivateChild, canLoad, resolve, data FROM component_routes
             WHERE projectId=?`,
            [projectId]
            
        );

        const componentRoutes: ComponentRoute[] = [];
        let componentRoute: ComponentRoute;
        
        for (const result of results) {
            componentRoute = {
                route: result.route,
                module: result.module,
                component: result.component,
                loadChildren: result.loadChildren,
                loadComponent: result.loadComponent,
                pathMatch: result.pathMatch,
                canActivate: result.canActivate !== undefined ? JSON.parse(result.canActivate) : undefined,
                canActivateChild: result.canActivateChild !== undefined ? JSON.parse(result.canActivateChild) : undefined,
                canLoad: result.canLoad !== undefined ? JSON.parse(result.canLoad) : undefined,
                resolve: result.resolve !== undefined ? JSON.parse(result.resolve) : undefined,
                data: result.data !== undefined ? JSON.parse(result.data) : undefined
            }
            componentRoutes.push(componentRoute)
        }

        return componentRoutes;

    } catch(e) {
        console.log("Error: componentRouteStorage.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}


// CREATE TABLE component_routes (
//     route               VARCHAR(512)   NOT NULL,
//     projectId           UUID           NOT NULL,
//     module              VARCHAR(128)   DEFAULT NULL,
//     component           VARCHAR(128)   NOT NULL,
//     loadChildren        VARCHAR(3000),
//     loadComponent       VARCHAR(3000),
//     pathMatch           VARCHAR(32),
//     canActivate         JSON,
//     canActivateChild    JSON,
//     canLoad             JSON,
//     resolve             JSON,
//     data                JSON,
//     inserted_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     PRIMARY KEY (route, projectId),
//     FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
//     FOREIGN KEY (module) REFERENCES modules(name) ON DELETE SET NULL,
//     FOREIGN KEY (component) REFERENCES components(name) ON DELETE CASCADE
// ) ENGINE=InnoDB;