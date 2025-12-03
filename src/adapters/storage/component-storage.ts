/**
 * Adapter for managing storage of the components.
 */
import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { ComponentInfo, RowComponentInfo } from '../../models/component-info.js';


export async function save(projectId : string, component : ComponentInfo, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
            `INSERT INTO components (selector, projectId, name, nestedComponents)
                VALUES (?, ?, ?, ?)`,
            [
                component.selector,
                projectId,
                component.name,
                JSON.stringify(component.nestedComponents),
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: componentStorage.save: ", e);
        throw e;
    }
}


export async function getAll(projectId: string, storageSession: StorageSession): Promise<ComponentInfo[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowComponentInfo[]>(
            `SELECT selector, name, nestedComponents FROM components WHERE projectId=?`,
            [projectId]
        );
        const components: ComponentInfo[] = [];
        let component: ComponentInfo;
        
        for (const result of results) {
            component = {
                name: result.name,
                selector: result.selector,
                nestedComponents: JSON.parse(result.nestedComponents),
                widgets: []
            }
            components.push(component)
        }
        return components;
    } catch(e) {
        logger.error("Error: componentStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(projectId: string, selector: string, storageSession: StorageSession): Promise<ComponentInfo | undefined> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowComponentInfo[]>(
            `SELECT selector, name, nestedComponents FROM components WHERE projectId=? AND selector=?`,
            [projectId, selector]
        );
        
        if (results.length === 0)
            return undefined;
            
        const result = results[0];
        
        const component = {
            name: result.name,
            selector: result.selector,
            nestedComponents: JSON.parse(result.nestedComponents),
            widgets: []
        }

        return component;
    } catch(e) {
        logger.error("Error: componentStorage.getById: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        await dbConnection.query<ResultSetHeader>(
            `DELETE FROM components WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch(e) {
        logger.error("Error: componentStorage.getByProjectId: ", e);
        throw e;
    }
}
