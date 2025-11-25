import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { UserJourney, RowUserJourney } from '../../models/user-journeys/user-journey-info.js';


export async function save(projectId : string, userJourney : UserJourney, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO userjourneys (projectId, id, rootModule, name, projectRoot, steps, expandedSteps, path, intent, success)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                userJourney.id,
                userJourney.rootModule,
                userJourney.name,
                userJourney.projectRoot,
                JSON.stringify(userJourney.steps),
                JSON.stringify(userJourney.expandedSteps),
                JSON.stringify(userJourney.path),
                userJourney.intent,
                userJourney.success
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: userJourneyStorage.save: ", e);
        return false;
    }
}


export async function getAll(projectId: string, storageSession: StorageSession): Promise<UserJourney[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowUserJourney[]>(
            `SELECT id, rootModule, name, projectRoot, steps, expandedSteps, path, intent, success FROM userjourneys WHERE projectId=?`,
            [projectId]
        );

        const userJourneys: UserJourney[] = [];
        let userJourney: UserJourney;
        
        for (const result of results) {
            userJourney = {
                id: result.id,
                name: result.name,
                rootModule: result.rootModule,
                projectRoot: result.projectRoot,
                steps: JSON.parse(result.steps),
                expandedSteps: JSON.parse(result.expandedSteps),
                path: result.path !== undefined ? JSON.parse(result.path) : undefined,
                intent: result.intent,
                success: result.success
            }
            userJourneys.push(userJourney)
        }

        return userJourneys;
    } catch(e) {
        console.log("Error: userJourneyStorage.getAll: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM userjourneys WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch(e) {
        console.log("Error: userJourneyStorage.getByProjectId: ", e);
        return false;
    }
}

export async function getById(projectId: string, id: string, storageSession: StorageSession): Promise<UserJourney> {
    let dbConnection: PoolConnection = storageSession.getConnector();

    try {        
        const [result] = await dbConnection.query<RowUserJourney[]>(
            `SELECT id, name, rootModule, projectRoot, steps, expandedSteps, path, intent, success FROM userjourneys WHERE id=?`,
            [id]
        );

        const rowUserJourney = result[0];

        const userJourney = {
            id: rowUserJourney.id,
            name: rowUserJourney.name,
            rootModule: rowUserJourney.rootModule,
            projectRoot: rowUserJourney.projectRoot,
            steps: JSON.parse(rowUserJourney.steps),
            expandedSteps: JSON.parse(rowUserJourney.expandedSteps),
            path: rowUserJourney.path !== undefined ? JSON.parse(rowUserJourney.path) : undefined,
            intent: rowUserJourney.intent,
            success: rowUserJourney.success
        }

        return userJourney;
    } catch(e) {
        console.log("Error: projectStorage.getById: ", e);
        throw e;
    }
}