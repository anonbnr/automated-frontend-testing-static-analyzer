import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { ComponentInfo, RowComponentInfo } from '../../models/component-info.js';

export async function save(projectId : string, component : ComponentInfo) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
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
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}


export async function getAll(projectId: string): Promise<ComponentInfo[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
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
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

// CREATE TABLE components (
//     selector        VARCHAR(128)    NOT NULL,
//     projectId       UUID            NOT NULL,
//     name            VARCHAR(128)    NOT NULL,
//     nestedComponents JSON           NOT NULL,
//     inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     PRIMARY KEY (selector, projectId),
//     INDEX idx_component_name (name),
//     FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
// ) ENGINE=InnoDB;