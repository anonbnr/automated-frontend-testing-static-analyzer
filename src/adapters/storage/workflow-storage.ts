import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";

import { StorageSession } from '../storageManager.js';

import { RowWorkflow, Workflow } from '../../models/workflows-info.js';


export async function save(projectId : string, workflow : Workflow, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO workflows (projectId, name, description)
                VALUES (?, ?, ?)`,
            [
                projectId,
                workflow.name,
                workflow.description,
            ]
        );
        return result.insertId;
    } catch(e) {
        logger.error("Error: WorkflowStorage.save: ", e);
        return undefined;
    }
}


export async function getAll(projectId: string, storageSession: StorageSession): Promise<Workflow[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowWorkflow[]>(
            `SELECT id, name, description FROM workflows WHERE projectId=?`,
            [projectId]
        );

        const workflows: Workflow[] = [];
        
        for (const result of results) {
            workflows.push({
                name: result.name,
                description: result.description,
                id: result.id,
            });
        }

        return workflows;
    } catch(e) {
        console.log("Error: workflowStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(projectId: string, id: number, storageSession: StorageSession): Promise<Workflow | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowWorkflow[]>(
            `SELECT id, name, description FROM workflows WHERE projectId=? AND id=?`,
            [projectId, id]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const workflow: Workflow = {
            name: result.name,
            description: result.description,
            id: result.id,
        };

        return workflow;
    } catch(e) {
        console.log("Error: workflowStorage.getById: ", e);
        throw e;
    }
}

export async function update(projectId: string, id: number, data: Record<string, unknown>, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {  
        const {sql, values} = sqlUpdateFragmentFromObject(data);

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE workflows SET ${sql} WHERE projectId=? AND id=?`,
            [...values, projectId, id]
        );
        return result;
    } catch(e) {
        console.log("Error: workflowStorage.update: ", e);
        return undefined;
    }
}


export async function deleteById(projectId: string, id: number, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM workflows WHERE projectId=? AND id=?`,
            [projectId, id]
        );
        return result;
    } catch(e) {
        console.log("Error: workflowStorage.deleteById: ", e);
        return undefined;
    }
}