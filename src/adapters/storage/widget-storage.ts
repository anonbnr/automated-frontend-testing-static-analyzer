import logger from "../../logging/logger.js";

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from "mysql2";

import { StorageSession } from '../storageManager.js';

import { RowWidgetInfo, WidgetInfo } from '../../models/widget-info.js';


export async function save(projectId : string, widget : WidgetInfo, componentSelector : string, storageSession: StorageSession, parentId? : string) {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
    }
}

export async function getAll(projectId: string, storageSession: StorageSession): Promise<WidgetInfo[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
        console.log("Error: widgetStorage.getAll: ", e);
        throw e;
    }
}

export async function getByComponentSelector(projectId : string, componentSelector : string, storageSession: StorageSession): Promise<WidgetInfo[]> {
    const dbConnection: PoolConnection = storageSession.getConnector();

    try {
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
        console.log("Error: widgetStorage.getAll: ", e);
        throw e;
    }
}
