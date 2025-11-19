import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { ComponentInfo, RowComponentInfo } from '../../models/component-info.js';
import { StorageSession } from '../storageManager.js';

export async function save(projectId : string, component : ComponentInfo, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
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
        logger.error("Error: AnalysisProject.registry.save: ", e);
        return false;
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
        console.log("Error: AnalysisProject.registry.getAll: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM components WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch(e) {
        console.log("Error: componentStorage.getByProjectId: ", e);
        return false;
    }
}
