/**
 * Adapter for managing storage of the component routes.
 */
import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { ComponentRoute, RowComponentRoute } from '../../models/route-info.js';


export async function save(projectId : string, componentRoute : ComponentRoute, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
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
        throw e;
    }
}

export async function getAll(projectId: string, storageSession: StorageSession): Promise<ComponentRoute[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
    }
}

export async function getById(projectId: string, id: string, storageSession: StorageSession): Promise<ComponentRoute | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowComponentRoute[]>(
            `SELECT route, module, component, loadChildren, loadComponent, pathMatch, canActivate, canActivateChild, canLoad, resolve, data
            FROM component_routes
            WHERE projectId=? AND route=?`,
            [projectId, id]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const componentRoute = {
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
        };

        return componentRoute;
    } catch(e) {
        console.log("Error: componentRouteStorage.getById: ", e);
        throw e;
    }
}