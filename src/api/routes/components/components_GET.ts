import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as componentStorage from '../../../adapters/storage/componentStorage.js';
import * as widgetStorage from '../../../adapters/storage/widgetStorage.js';
import { WidgetInfo, RowWidgetInfo } from '../../../models/widget-info.js';
import { makeWidgetsTree } from '../utils/widgets.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

export default function buildRoute(router: Router) {


    router.get('/projects/:projectId/components', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await storageManager.getSession();

            const projectId = req.params.projectId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const components = await componentStorage.getAll(projectId, storageSession);
            if (components === undefined ) {
                return resp.status(404).json({ error: "components not found" });
            }
            
            let widgets: WidgetInfo[];
            for (const component of components) {
                widgets = await widgetStorage.getByComponentSelector(projectId, component.selector, storageSession);
                component.widgets = makeWidgetsTree(widgets, undefined);
            }
            
            return resp.json(components);

        } catch (err: any) {
            logger.error("[GET /project/:projectId/components] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get components' });
        } finally {
            storageSession?.ends();
        }
    })
}