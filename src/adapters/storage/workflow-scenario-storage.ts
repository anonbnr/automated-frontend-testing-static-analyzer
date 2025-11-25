import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { RowWorkflow } from '../../models/workflows-info.js';
import { RowWorkflowScenario, WorkflowScenario } from '../../models/workflow-scenario-info.js';


export async function save(workflowScenario : WorkflowScenario, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [rows] = await dbConnection.query<RowDataPacket[]>(
            `SELECT COUNT(*) + 1 as nextOrder FROM workflows_scenarios WHERE workflowId=?`,
            [workflowScenario.workflowId]
        )

        const order = rows[0].nextOrder as number;

        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO workflows_scenarios (workflowId, scenarioId, \`order\`)
                VALUES (?, ?, ?)`,
            [
                workflowScenario.workflowId,
                workflowScenario.scenarioId,
                order,
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: workflowScenarioStorage.save: ", e);
        return false;
    }
}


export async function getAll(workflowId: number, storageSession: StorageSession): Promise<WorkflowScenario[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowWorkflow[]>(
            `SELECT workflowId, scenarioId, \`order\`, inserted_at, updated_at FROM workflows_scenarios WHERE workflowId=?`,
            [workflowId]
        );

        const workflowScenarios: WorkflowScenario[] = [];
        
        for (const result of results) {
            workflowScenarios.push({
                workflowId: result.workflowId,
                scenarioId: result.scenarioId,
                order: result.order,
                insertedAt: result.inserted_at,
                updatedAt: result.updated_at,
            });
        }

        return workflowScenarios;
    } catch(e) {
        console.log("Error: workflowScenarioStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(workflowId: number, scenarioId: number, storageSession: StorageSession): Promise<WorkflowScenario | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowWorkflowScenario[]>(
            `SELECT workflowId, scenarioId, \`order\`, inserted_at, updated_at FROM workflows_scenarios WHERE workflowId=? AND scenarioId=?`,
            [workflowId, scenarioId]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const workflowScenario: WorkflowScenario = {
            workflowId: result.workflowId,
            scenarioId: result.scenarioId,
            order: result.order,
            insertedAt: result.inserted_at,
            updatedAt: result.updated_at,
        };

        return workflowScenario;
    } catch(e) {
        console.log("Error: workflowScenarioStorage.getById: ", e);
        throw e;
    }
}

export async function update(workflowId: number, scenarioId: number, newOrder: number, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {  
        const currentOrder = (await getById(workflowId, scenarioId, storageSession))?.order;

        if(currentOrder === undefined) {
            throw new Error("The scenario does not exists in this workflow");
        }
        
        if(currentOrder === newOrder) {
            return true;
        }

        // Mark the scenario to move as order -1 to freee the slot
        await dbConnection.query<ResultSetHeader>(
        `ALTER TABLE workflows_scenarios DROP INDEX workflowId`);

        // Move forward the range between the current order and the new order to free the destination slot
        if(newOrder < currentOrder) {
            const [result] = await dbConnection.query<ResultSetHeader>(
                `UPDATE workflows_scenarios
                SET \`order\` = \`order\` + 1
                WHERE workflowId=?
                    AND \`order\` >= ?
                    And \`order\` < ?`,
                [workflowId, newOrder, currentOrder]
            );
        }
        // Move backward the range between the current order and the new order to free the destination slot
        else {
            const [result] = await dbConnection.query<ResultSetHeader>(
                `UPDATE workflows_scenarios SET \`order\` = \`order\` - 1
                WHERE workflowId=?
                    AND \`order\` > ?
                    And \`order\` <= ?`,
                [workflowId, currentOrder, newOrder]
            );
        }

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE workflows_scenarios
                SET \`order\` = ?
                WHERE workflowId=? AND scenarioId = ?`,
            [newOrder, workflowId, scenarioId]);
        
        await dbConnection.query<ResultSetHeader>(
        `ALTER TABLE workflows_scenarios ADD UNIQUE KEY (workflowId, \`order\`)`);
        
        return true;
    } catch(e) {
        console.log("Error: workflowScenarioStorage.update: ", e);
        throw (e);
    }
}


export async function deleteById(workflowScenario: WorkflowScenario, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();
    
    try {
        await dbConnection.query<ResultSetHeader>(
        `ALTER TABLE workflows_scenarios DROP INDEX workflowId`);

        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM workflows_scenarios WHERE workflowId=? AND scenarioId=?`,
            [workflowScenario.workflowId, workflowScenario.scenarioId]
        );
        await dbConnection.query<ResultSetHeader>(
            `UPDATE workflows_scenarios SET \`order\` = \`order\` - 1 WHERE workflowId=? AND \`order\` > ?`,
            [workflowScenario.workflowId, workflowScenario.order]
        );

        await dbConnection.query<ResultSetHeader>(
        `ALTER TABLE workflows_scenarios ADD UNIQUE KEY (workflowId, \`order\`)`);

        return true;
    } catch(e) {
        console.log("Error: workflowScenarioStorage.deleteById: ", e);
        throw (e);
    }
}