import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { ModuleInfo, RowModuleInfo } from '../../models/module-info.js';


export async function save(projectId: string, module: ModuleInfo, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
    } catch (e) {
        logger.error("Error: moduleStorage.save: ", e);
        return false;
    }
}


export async function getAll(projectId: string, storageSession: StorageSession): Promise<ModuleInfo[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
    } catch (e) {
        console.log("Error: moduleStorage.getAll: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM modules WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch (e) {
        console.log("Error: moduleStorage.getByProjectId: ", e);
        return false;
    }
}
