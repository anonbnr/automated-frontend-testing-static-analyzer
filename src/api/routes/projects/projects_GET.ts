import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';

export default function buildRoute(router: Router) {

    router.get('/projects', async (req: Request, res: Response) => {

        try {
            const results = await projectRegistry.getAll();
            return res.json({ results });

        } catch (err: any) {
            logger.error("[GET /projects] Fatal error: %o", err);
            return res
                .status(500)
                .json({ error: err.message || 'Failed to get projects' });
        }
    })
}