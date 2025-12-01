import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { RowWorkflow } from '../../models/workflows-info.js';
import { RowWorkflowResult, WorkflowResult } from "../../models/workflow-result.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";


export async function save(workflowResult: WorkflowResult, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {

        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO workflows_results (workflowId, scenarioId, success, message, screenshot)
                VALUES (?, ?, ?, ?, ?)`,
            [
                workflowResult.workflowId,
                workflowResult.scenarioId,
                workflowResult.success,
                workflowResult.message,
                workflowResult.screenshot,
            ]
        );
        return true;
    } catch (e) {
        logger.error("Error: workflowResultStorage.save: ", e);
        throw e;
    }
}


export async function getAll(workflowId: number, storageSession: StorageSession): Promise<WorkflowResult[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowWorkflow[]>(
            `SELECT workflowId, scenarioId, success, message, screenshot, inserted_at, updated_at FROM workflows_results WHERE workflowId=?`,
            [workflowId]
        );

        const workflowResults: WorkflowResult[] = [];

        for (const result of results) {
            workflowResults.push({
                workflowId: result.workflowId,
                scenarioId: result.scenarioId,
                success: result.success,
                message: result.message,
                screenshot: result.screenshot,
                insertedAt: result.inserted_at,
                updatedAt: result.updated_at,
            });
        }

        return workflowResults;
    } catch (e) {
        console.log("Error: workflowResultStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(workflowId: number, scenarioId: number, storageSession: StorageSession): Promise<WorkflowResult | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowWorkflowResult[]>(
            `SELECT workflowId, scenarioId, success, message, screenshot, inserted_at, updated_at FROM workflows_results WHERE workflowId=? AND scenarioId=?`,
            [workflowId, scenarioId]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const workflowResult: WorkflowResult = {
            workflowId: result.workflowId,
            scenarioId: result.scenarioId,
            success: result.success,
            message: result.message,
            screenshot: result.screenshot,
            insertedAt: result.inserted_at,
            updatedAt: result.updated_at,
        };

        return workflowResult;
    } catch (e) {
        console.log("Error: workflowResultStorage.getById: ", e);
        throw e;
    }
}

export async function update(workflowId: number, scenarioId: number, data: Record<string, unknown>, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const { sql, values } = sqlUpdateFragmentFromObject(data);

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE workflows_results SET ${sql} WHERE workflowId=? AND scenarioId=?`,
            [...values, workflowId, scenarioId]
        );
        return result;
    } catch (e) {
        console.log("Error: workflowResultStorage.update: ", e);
        throw e;
    }
}


export async function deleteById(workflowId: number, scenarioId: number, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM workflows_results WHERE workflowId=? AND scenarioId=?`,
            [workflowId, scenarioId]
        );
        return result;
    } catch (e) {
        console.log("Error: workflowResultStorage.deleteById: ", e);
        throw e;
    }
}