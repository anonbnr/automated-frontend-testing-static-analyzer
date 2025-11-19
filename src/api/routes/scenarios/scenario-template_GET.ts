/**
 * Gather all widgets IDs (flattened array) for a specified component.
 * Retrie
 e the widgets from the previously computed analysis.
 */

import { Request, Response, Router } from 'express';

import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import { WidgetInfo, RowWidgetInfo } from '../../../models/widget-info.js';
import { makeWidgetsTree } from '../utils/widgets.js';
import logger from '../../../logging/logger.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import { inferActions } from '../../../builders/scenarios/scenario-step-inferer.js';


// Auto-loaded function (in index.ts loadAndBuildRoutes()) for building route
export default function buildRoute(router: Router) {

    router.get('/projects/:projectId/user-journeys/:journeyId/scenario-template', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        try {
            storageSession = await  storageManager.getSession();

            const projectId = req.params.projectId;
            const journeyId = req.params.journeyId;

            const project = await projectStorage.getById(projectId, storageSession);
            if (project === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            const userJourney = await userJourneyStorage.getById(projectId, journeyId, storageSession);
            if (userJourney === undefined) {
                return resp.status(404).json({ error: "user-journey not found" });
            }

            return resp.json( userJourney.expandedSteps );

        } catch (err: any) {
            logger.error("[GET /project/:projectId/user-journeys/:journeyId/scenario-template] Fatal error: %o", err);
            return resp.status(500).json({ error: err.message || 'Failed to infer scenarios' });
        } finally {
            storageSession?.ends();
        }
    })
}
