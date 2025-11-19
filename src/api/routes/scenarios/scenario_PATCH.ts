import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as scenarioStorage from '../../../adapters/storage/scenario-storage.js';
import { projectSchemaPost } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../utils/schema.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';

export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId/user-journeys/:journeyId/scenario', async (req: Request, resp: Response) => {
        
        let storageSession: StorageSession | undefined;

        const {
            name,
            description,
            editedBy,
            startRoutePath,
            startComponentPath,
            tags,
            status,
            coverage,
            stepsData,
        } = req.body;
        

        // const parseResult = projectSchemaPost.safeParse({name, description, projectRoot, url});
        // if (!parseResult.success) { 
        //     return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        // }

        try {
            storageSession = await storageManager.getSession();

            const results = await scenarioStorage.save
            if (results === undefined)
                return resp.status(500).json({ error: 'Failed to post project' });
            
            return resp.status(200).json();

        } catch (err: any) {
            logger.error("[POST /projects] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to post project' });
        } finally {
            storageSession?.ends();
        }
    })
}
