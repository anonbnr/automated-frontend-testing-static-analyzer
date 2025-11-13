import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { ModuleInfo, RowModuleInfo } from '../../models/module-info.js';


export async function save(projectId : string, module : ModuleInfo) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO modules (name, projectId, filePath, imports, declarations, exports, lazy, role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                module.name,
                projectId,
                module.filePath,
                JSON.stringify(module.imports),
                JSON.stringify(module.declarations),
                JSON.stringify(module.exports),
                module.lazy,
                module.role
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


export async function getAll(projectId: string): Promise<ModuleInfo[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<RowModuleInfo[]>(
            `SELECT name, filePath, imports, declarations, exports, lazy, role FROM modules WHERE projectId=?`,
            [projectId]
        );

        const modules: ModuleInfo[] = [];
        let module: ModuleInfo;
        
        for (const result of results) {
            module = {
                name: result.name,
                filePath: result.filePath,
                imports: JSON.parse(result.imports),
                declarations: JSON.parse(result.declarations),
                exports: JSON.parse(result.exports),
                lazy: result.lazy,
                role: result.role
            }
            modules.push(module)
        }
        return modules;
    } catch(e) {
        console.log("Error: AnalysisProject.registry.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

// CREATE TABLE modules (
//     name            VARCHAR(128)    NOT NULL,
//     projectId       UUID            NOT NULL,
//     filePath        VARCHAR(1024)   NOT NULL,
//     imports         JSON            NOT NULL,
//     declarations    JSON            NOT NULL,
//     exports         JSON            NOT NULL,
//     lazy            BOOLEAN         NOT NULL,
//     role            VARCHAR(32)     NOT NULL,
//     inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     PRIMARY KEY (name, projectId),
//     FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
// ) ENGINE=InnoDB;