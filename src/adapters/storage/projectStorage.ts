import dbPool from "../../db/connection.js";
import { Pool, PoolConnection } from 'mysql2/promise';
import { AnalysisProject } from "../../models/project-info.js";
import { ResultSetHeader } from "mysql2";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import { patternUnion } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { v4 as uuidv4 } from "uuid";

export async function save(name : string, description : string, projectRoot : string, url : string) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        const id = uuidv4();
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO projects (id, name, description, projectRoot, url)
                VALUES (?, ?, ?, ?, ?)`,
            [id, name, description, projectRoot, url]
        );
        return id;
    } catch(e) {
        logger.error("Error: projectStorage.save: ", e);
        return undefined;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getAll(): Promise<AnalysisProject[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<AnalysisProject[]>(
            `SELECT id, name, description, projectRoot, url FROM projects`
        );
        return result;
    } catch(e) {
        console.log("Error: projectStorage.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getById(id: string): Promise<AnalysisProject | undefined> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<AnalysisProject[]>(
            `SELECT name, description, projectRoot, url FROM projects WHERE id=?`,
            [id]
        );
        return result[0];
    } catch(e) {
        console.log("Error: projectStorage.getById: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function update(id: string, name : string, description : string, projectRoot : string, url : string) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
     
        const {sql, values} = sqlUpdateFragmentFromObject({name, description, projectRoot, url});

        const [result] = await dbConnection.query<AnalysisProject[]>(
            `UPDATE projects SET ${sql} WHERE id=?`,
            [...values, id]
        );
        return result;
    } catch(e) {
        console.log("Error: projectStorage.update: ", e);
        return undefined;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function deleteById(id: string) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM projects WHERE id=?`,
            [id]
        );
        return result;
    } catch(e) {
        console.log("Error: projectStorage.getById: ", e);
        return undefined;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function searchByParam(param: string, searchTerm: string): Promise<AnalysisProject[]> {
	let dbConnection: PoolConnection | undefined;

	try {
		dbConnection = await dbPool.getConnection();

		const condition = patternUnion(param, searchTerm);

		const [results] = await dbConnection.query<AnalysisProject[]>(
			`SELECT id, name, description, projectRoot, url FROM projects WHERE ${condition}`
		);

		return results;
	} catch (e) {
		console.error("Error: projectStorage.searchByParam: ", e);
        throw e;
		
	} finally {
		if (dbConnection) dbConnection.release();
	}
}