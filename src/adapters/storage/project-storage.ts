import logger from "../../logging/logger.js";
import { v4 as uuidv4 } from "uuid";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import { patternUnion } from "../utils/sqlFragments.js";

import { StorageSession } from "../storageManager.js";

import { AnalysisProject } from "../../models/project-info.js";


export async function save(name : string, description : string, projectRoot : string, url : string, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const id = uuidv4();
        await dbConnection.query<ResultSetHeader>(
            `INSERT INTO projects (id, name, description, projectRoot, url)
                VALUES (?, ?, ?, ?, ?)`,
            [id, name, description, projectRoot, url]
        );
        return id;
    } catch(e) {
        logger.error("Error: projectStorage.save: ", e);
        throw e;
    }
}

export async function getAll(storageSession: StorageSession): Promise<AnalysisProject[]> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<AnalysisProject[]>(
            `SELECT id, name, description, projectRoot, url, scannedAt FROM projects`
        );
        return result;
    } catch(e) {
        logger.error("Error: projectStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(id: string, storageSession: StorageSession): Promise<AnalysisProject | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [result] = await dbConnection.query<AnalysisProject[]>(
            `SELECT name, description, projectRoot, url, scannedAt FROM projects WHERE id=?`,
            [id]
        );
        return result[0];
    } catch(e) {
        logger.error("Error: projectStorage.getById: ", e);
        throw e;
    }
}

export async function update(id: string, name: string, description: string, projectRoot: string, url: string, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {  
        const {sql, values} = sqlUpdateFragmentFromObject({name, description, projectRoot, url});

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE projects SET ${sql} WHERE id=?`,
            [...values, id]
        );
        return result;
    } catch(e) {
        logger.error("Error: projectStorage.update: ", e);
        throw e;
    }
}

export async function updateScanDate(id: string, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE projects SET scannedAt = CURRENT_TIMESTAMP WHERE id=?`,
            [id]
        );
        return result;
    } catch(e) {
        logger.error("Error: projectStorage.updateScanDate: ", e);
        throw e;
    }
}

export async function refreshUpdateAt(id: string, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id=?`,
            [id]
        );
        return result;
    } catch(e) {
        logger.error("Error: projectStorage.updateScanDate: ", e);
        throw e;
    }
}

export async function deleteById(id: string, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM projects WHERE id=?`,
            [id]
        );
        return result;
    } catch(e) {
        logger.error("Error: projectStorage.deleteById: ", e);
        throw e;
    }
}

export async function searchByParam(param: string, searchTerm: string, storageSession: StorageSession): Promise<AnalysisProject[]> {
	let dbConnection: PoolConnection = storageSession.getConnector();

	try {
		const condition = patternUnion(param, searchTerm);

		const [results] = await dbConnection.query<AnalysisProject[]>(
			`SELECT id, name, description, projectRoot, url, scannedAt FROM projects WHERE ${condition}`
		);

		return results;
	} catch (e) {
		logger.error("Error: projectStorage.searchByParam: ", e);
        throw e;	
	}
}