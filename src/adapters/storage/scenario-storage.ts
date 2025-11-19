import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";

import { RowScenario, Scenario } from '../../models/scenarios/scenarios-info.js';
import { RowUserJourney } from '../../models/user-journeys/user-journey-info.js';
import { StorageSession } from '../storageManager.js';


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

// CREATE TABLE scenarios (
//     id                      INT AUTO_INCREMENT PRIMARY KEY,
//     userJourneyId           VARCHAR(512)   NOT NULL,
//     projectId               UUID           NOT NULL,
//     name                    VARCHAR(128)   NOT NULL,
//     description             TEXT,
//     editedBy                VARCHAR(32)    NOT NULL,
//     startRoutePath          VARCHAR(512)   NOT NULL,
//     startComponentSelector  VARCHAR(128)   NOT NULL,
//     tags                    JSON,
//     status                  VARCHAR(32),
//     coverage                JSON,
//     stepsData               JSON,
//     inserted_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
//     FOREIGN KEY (userJourneyId) REFERENCES userjourneys(id) ON DELETE CASCADE
// ) ENGINE=InnoDB;


export async function getByUserJourney(projectId: string, userJourneyId: string, storageSession: StorageSession): Promise<Scenario[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowScenario[]>(
            `SELECT id, name, description, editedBy, tags, status, coverage, stepsData FROM scenarios WHERE projectId=? AND userJourneyId=?`,
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
                id: result.id,
            });
        }

        return scenarios;
    } catch(e) {
        console.log("Error: userJourneyStorage.getAll: ", e);
        throw e;
    }
}

export async function getById(projectId: string, userJourneyId: string, id: number, storageSession: StorageSession): Promise<Scenario | undefined> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [results] = await dbConnection.query<RowScenario[]>(
            `SELECT id, name, description, editedBy, tags, status, coverage, stepsData FROM scenarios WHERE projectId=? AND userJourneyId=? AND id=?`,
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
            id: result.id,
        };

        return scenario;
    } catch(e) {
        console.log("Error: scenarioStorage.getById: ", e);
        throw e;
    }
}

export async function update(id: number, data: Record<string, unknown>, storageSession: StorageSession) {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {  
        const {sql, values} = sqlUpdateFragmentFromObject(data);

        const [result] = await dbConnection.query<ResultSetHeader>(
            `UPDATE scenarios SET ${sql} WHERE id=?`,
            [...values, id]
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