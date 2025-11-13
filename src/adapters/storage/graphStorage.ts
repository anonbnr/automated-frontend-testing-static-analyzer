import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { AppNavigation } from '../../llm/schemas.js';
import { RowAppNavigation } from '../../models/navigation-graph.js';

export async function save(projectId : string, graph : AppNavigation) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
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
    } catch(e) {
        logger.error("Error: AnalysisProject.registry.save: ", e);
        return false;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getAll(projectId: string): Promise<AppNavigation[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
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

    } catch(e) {
        console.log("Error: componentRouteStorage.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}