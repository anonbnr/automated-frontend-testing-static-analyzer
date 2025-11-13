import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import dbPool from "../../db/connection.js";
import { sqlUpdateFragmentFromObject } from "../utils/sqlFragments.js";
import logger from "../../logging/logger.js";
import { RowWidgetInfo, WidgetInfo } from '../../models/widget-info.js';

export async function save(projectId : string, widget : WidgetInfo, componentSelector : string, parentId? : string) {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [result] = await dbConnection.query<ResultSetHeader>(
            `INSERT INTO widgets (projectId, componentSelector, parentId, id, type, events, attributes, validationRules, triggersFormSubmission)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                projectId,
                componentSelector,
                parentId,
                widget.id,
                widget.type,
                JSON.stringify(widget.events),
                JSON.stringify(widget.attributes),
                JSON.stringify(widget.validationRules),
                widget.triggersFormSubmission,
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

export async function getAll(projectId: string): Promise<WidgetInfo[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<RowWidgetInfo[]>(
            `SELECT id, parentId, type, events, attributes, validationRules, triggersFormSubmission FROM widgets WHERE projectId=?`,
            [projectId]
        );

        const widgets: WidgetInfo[] = [];
        let widget: WidgetInfo;
        
        for (const result of results) {
            widget = {
                id: result.id,
                parentId: result.parentId,
                type: result.type,
                events: JSON.parse(result.events),
                attributes: result.attributes !== undefined ? JSON.parse(result.attributes) : undefined,
                validationRules: result.validationRules !== undefined ? JSON.parse(result.validationRules) : undefined,
                triggersFormSubmission: result.triggersFormSubmission
            }
            widgets.push(widget)
        }

        return widgets;
    } catch(e) {
        console.log("Error: AnalysisProject.registry.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}

export async function getByComponentSelector(projectId : string, componentSelector : string): Promise<WidgetInfo[]> {
    let dbConnection: PoolConnection | undefined;

    try {
        dbConnection = await dbPool.getConnection();
        
        const [results] = await dbConnection.query<RowWidgetInfo[]>(
            `SELECT id, parentId, type, events, attributes, validationRules, triggersFormSubmission FROM widgets
             WHERE projectId=? AND componentSelector=?`,
            [projectId, componentSelector]
        );

        const widgets: WidgetInfo[] = [];
        let widget: WidgetInfo;
        
        for (const result of results) {
            widget = {
                id: result.id,
                parentId: result.parentId,
                type: result.type,
                events: JSON.parse(result.events),
                attributes: result.attributes !== undefined ? JSON.parse(result.attributes) : undefined,
                validationRules: result.validationRules !== undefined ? JSON.parse(result.validationRules) : undefined,
                triggersFormSubmission: result.triggersFormSubmission,
            }
            widgets.push(widget)
        }

        return widgets;
    } catch(e) {
        console.log("Error: AnalysisProject.registry.getAll: ", e);
        throw e;
    } finally {
        if (dbConnection)
            dbConnection.release();
    }
}


// CREATE TABLE widgets (
//     id                      VARCHAR(512)    NOT NULL,
//     componentSelector        VARCHAR(128),
//     parentId                 VARCHAR(512),
//     projectId                UUID           NOT NULL,
//     type                    VARCHAR(128)    NOT NULL,
//     events                  JSON,
//     attributes              JSON,
//     validationRules         JSON,
//     triggersFormSubmission  BOOLEAN         NOT NULL,
//     inserted_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
//     updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//     PRIMARY KEY (id, projectId),
//     FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
//     FOREIGN KEY (componentSelector) REFERENCES components(selector) ON DELETE SET NULL,
//     FOREIGN KEY (parentId) REFERENCES widgets(id) ON DELETE SET NULL
// ) ENGINE=InnoDB;