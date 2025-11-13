/**
 * Gather all widgets IDs (flattened array) for a specified component.
 * Retrieve the widgets from the previously computed analysis.
 */

import { Request, Response, Router } from 'express';

import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as widgetStorage from '../../../adapters/storage/widgetStorage.js';
import { WidgetInfo, RowWidgetInfo } from '../../../models/widget-info.js';
import { makeWidgetsTree } from '../utils/widgets.js';
import logger from '../../../logging/logger.js';


// Auto-loaded function (in index.ts loadAndBuildRoutes()) for building route
export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/components/:componentSelector/widgets-ids', async (req: Request, resp: Response) => {

        try {
            const projectId = req.params.projectId;
            const componentSelector = req.params.componentSelector;

            const project = await projectStorage.getById(projectId);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }
            
            const flatedWidgets: WidgetInfo[] = await widgetStorage.getByComponentSelector(projectId, componentSelector);
            const widgetsIds = flatedWidgets.map(widget => widget.id);

            return resp.json(widgetsIds);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/components] Fatal error: %o", err);
            return resp.status(500).json({ error: err.message || 'Failed to get project' });
        }
    })
}
