import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';

export default function buildRoute(router: Router) {

    router.get('/projects', async (req: Request, resp: Response) => {

        try {
            const results = await projectStorage.getAll();
            return resp.json(results);

        } catch (err: any) {
            logger.error("[GET /projects] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to get projects' });
        }
    })
}