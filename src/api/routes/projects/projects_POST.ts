import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';
import { projectSchemaPost } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../../../adapters/utils/schema.js';

export default function buildRoute(router: Router) {

    router.post('/projects', async (req: Request, res: Response) => {

        const { name, description, projectRoot, url } = req.body as { name: string, description: string, projectRoot: string, url: string };

        const parseResult = projectSchemaPost.safeParse({name, description, projectRoot, url});
        if (!parseResult.success) { 
            return res.status(400).json({ error: formatZodErrors(parseResult.error) });
        }

        try {
            const results = await projectRegistry.save(name, description, projectRoot, url);
            if (results === false)
                return res.status(500).json({ error: 'Failed to post project' });    
            
            return res.status(204).send();

        } catch (err: any) {
            logger.error("[POST /projects] Fatal error: %o", err);
            return res
                .status(500)
                .json({ error: err.message || 'Failed to post project' });
        }
    })
}
