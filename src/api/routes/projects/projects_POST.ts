import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import { projectSchemaPost } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../utils/schema.js';

export default function buildRoute(router: Router) {

    router.post('/projects', async (req: Request, resp: Response) => {

        const { name, description, projectRoot, url } = req.body as { name: string, description: string, projectRoot: string, url: string };

        const parseResult = projectSchemaPost.safeParse({name, description, projectRoot, url});
        if (!parseResult.success) { 
            return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
        }

        try {
            const results = await projectStorage.save(name, description, projectRoot, url);
            if (results === undefined)
                return resp.status(500).json({ error: 'Failed to post project' });
            
            return resp.status(200).json({id: results});

        } catch (err: any) {
            logger.error("[POST /projects] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to post project' });
        }
    })
}
