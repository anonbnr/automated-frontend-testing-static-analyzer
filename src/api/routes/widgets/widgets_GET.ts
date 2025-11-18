/**
 * Gather all widgets (tree) for a specified component.
 * Retrieve the widgets from the previously computed analysis.
 */

import { Request, Response, Router } from 'express';

import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as widgetStorage from '../../../adapters/storage/widgetStorage.js';
import { WidgetInfo, RowWidgetInfo } from '../../../models/widget-info.js';
import { makeWidgetsTree } from '../utils/widgets.js';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';


// Auto-loaded function (in index.ts loadAndBuildRoutes()) for building route
export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/components/:componentSelector/widgets', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;
            const componentSelector = req.params.componentSelector;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const flatedWidgets = await widgetStorage.getByComponentSelector(projectId, componentSelector, storageSession);
            const widgets = makeWidgetsTree(flatedWidgets);
            
            return resp.json(widgets);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/components/:componentId/widget-ids] Fatal error: %o", err);
            return resp.status(500).json({ error: err.message || 'Failed to get widget-ids' });
        } finally {
            storageSession?.ends();
        }
    })
}
