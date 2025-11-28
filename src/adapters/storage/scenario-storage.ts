import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";

import { StorageSession } from '../storageManager.js';

import { RowScenario, Scenario } from '../../models/scenarios/scenarios-info.js';


export async function save(projectId : string, userJourneyId: string, scenario : Scenario, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO scenarios (projectId, userJourneyId, name, description, editedBy, tags, status, coverage, stepsData)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                userJourneyId,
                scenario.name,
                scenario.description,
                scenario.editedBy,
                JSON.stringify(scenario.tags),
                scenario.status,
                scenario.coverage,
                JSON.stringify(scenario.stepsData),
            ]
        );
        return result.insertId;
    } catch(e) {
        logger.error("Error: ScenarioStorage.save: ", e);
        return undefined;
    }
}


export async function getByUserJourney(projectId: string, userJourneyId: string, storageSession: StorageSession): Promise<Scenario[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowScenario[]>(
            `SELECT id, name, description, editedBy, tags, status, coverage, stepsData, expectedResult FROM scenarios WHERE projectId=? AND userJourneyId=?`,
            [projectId, userJourneyId]
        );

        const scenarios: Scenario[] = [];
        
        for (const result of results) {
            scenarios.push({
                userJourneyId: userJourneyId,
                name: result.name,
                description: result.description,
                editedBy: result.editedBy,
                tags: result.tags !== undefined ? JSON.parse(result.tags) : undefined,
                status: result.status,
                coverage: result.coverage,
                stepsData: JSON.parse(result.stepsData),
                expectedResult: JSON.parse(result.expectedResult),
                id: result.id,
            });
        }

        return scenarios;
    } catch(e) {
        console.log("Error: scenarioStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(projectId: string, userJourneyId: string, id: number, storageSession: StorageSession): Promise<Scenario | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowScenario[]>(
            `SELECT id, name, description, editedBy, tags, status, coverage, stepsData, expectedResult FROM scenarios WHERE projectId=? AND userJourneyId=? AND id=?`,
            [projectId, userJourneyId, id]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const scenario: Scenario = {
            userJourneyId: userJourneyId,
            name: result.name,
            description: result.description,
            editedBy: result.editedBy,
            tags: result.tags !== undefined ? JSON.parse(result.tags) : undefined,
            status: result.status,
            coverage: result.coverage,
            stepsData: JSON.parse(result.stepsData),
            expectedResult: JSON.parse(result.expectedResult),
            id: result.id,
        };

        return scenario;
    } catch(e) {
        console.log("Error: scenarioStorage.getById: ", e);
        throw e;
    }
}

export async function get(projectId: string, id: number, storageSession: StorageSession): Promise<Scenario | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowScenario[]>(
            `SELECT id, userJourneyId, name, description, editedBy, tags, status, coverage, stepsData, expectedResult FROM scenarios WHERE projectId=? AND id=?`,
            [projectId, id]
        );

        if (results.length === 0)
            return undefined;

        const result = results[0];

        const scenario: Scenario = {
            userJourneyId: result.userJourneyId,
            name: result.name,
            description: result.description,
            editedBy: result.editedBy,
            tags: result.tags !== undefined ? JSON.parse(result.tags) : undefined,
            status: result.status,
            coverage: result.coverage,
            stepsData: JSON.parse(result.stepsData),
            expectedResult: JSON.parse(result.expectedResult),
            id: result.id,
        };

        return scenario;
    } catch(e) {
        console.log("Error: scenarioStorage.getById: ", e);
        throw e;
    }
}

export async function update(projectId: string, userJourneyId: string, id: number, data: Record<string, unknown>, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {  
        const {sql, values} = sqlUpdateFragmentFromObject(data);

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE scenarios SET ${sql} WHERE projectId=? AND userJourneyId=? AND id=?`,
            [...values, projectId, userJourneyId, id]
        );
        return result;
    } catch(e) {
        console.log("Error: scenarioStorage.update: ", e);
        return undefined;
    }
}


export async function deleteById(projectId: string, userJourneyId: string, id: number, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM scenarios WHERE projectId=? AND userJourneyId=? AND id=?`,
            [projectId, userJourneyId, id]
        );
        return result;
    } catch(e) {
        console.log("Error: scenarioStorage.deleteById: ", e);
        return undefined;
    }
}