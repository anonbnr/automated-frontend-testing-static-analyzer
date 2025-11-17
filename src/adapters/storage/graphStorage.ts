import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { AppNavigation } from '../../llm/schemas.js';
import { RowAppNavigation } from '../../models/navigation-graph.js';
import { StorageSession } from '../storageManager.js';

export async function save(projectId: string, graph: AppNavigation, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO graphs (projectId, nodes, edges, transitions)
                VALUES (?, ?, ?, ?)`,
            [
                projectId,
                JSON.stringify(graph.nodes),
                JSON.stringify(graph.edges),
                JSON.stringify(graph.transitions),
            ]
        );
        return true;
    } catch (e) {
        logger.error("Error: AnalysisProject.registry.save: ", e);
        return false;
    }
}

export async function getAll(projectId: string, storageSession: StorageSession): Promise<AppNavigation[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [results] = await dbConnection.query<RowAppNavigation[]>(
            `SELECT nodes, edges, transitions FROM graphs
             WHERE projectId=?`,
            [projectId]

        );

        const graphs: AppNavigation[] = [];
        let graph: AppNavigation;

        for (const result of results) {
            graph = {
                nodes: JSON.parse(result.nodes),
                edges: JSON.parse(result.edges),
                transitions: JSON.parse(result.transitions),
            }
            graphs.push(graph)
        }

        return graphs;

    } catch (e) {
        console.log("Error: componentRouteStorage.getAll: ", e);
        throw e;
    }
}

export async function deleteByProjectId(projectId: string, storageSession: StorageSession) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
        const [result] = await dbConnection.query<ResultSetHeader>(
            `DELETE FROM graphs WHERE projectId=?`,
            [projectId]
        );
        return true;
    } catch (e) {
        console.log("Error: graphStorage.getByProjectId: ", e);
        return false;
    }
}