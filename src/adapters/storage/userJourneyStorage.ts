import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";

import { UserJourney } from '../../llm/schemas.js';
import { RowUserJourney } from '../../models/user-journeys/user-journey-info.js';


export async function save(projectId : string, userJourney : UserJourney) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO userjourneys (projectId, id, rootModule, name, projectRoot, steps, path, intent, success)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                userJourney.id,
                userJourney.rootModule,
                userJourney.name,
                userJourney.projectRoot,
                JSON.stringify(userJourney.steps),
                JSON.stringify(userJourney.path),
                userJourney.intent,
                userJourney.success
            ]
        );
        return true;
    } catch(e) {
        logger.error("Error: userJourneyStorage.save: ", e);
        return false;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}


export async function getAll(projectId: string): Promise<UserJourney[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<RowUserJourney[]>(
            `SELECT id, rootModule, name, projectRoot, steps, path, intent, success FROM userjourneys WHERE projectId=?`,
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
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}
