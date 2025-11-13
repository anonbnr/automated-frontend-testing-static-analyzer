import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import { projectSchemaPatch } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../utils/schema.js';

export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId', async (req: Request, resp: Response) => {

        const { name, description, projectRoot, url } = req.body as { name: string, description: string, projectRoot: string, url: string }
        const projectId = req.params.projectId;

        try {

            const checkProjectId = await projectStorage.getById(projectId);
            if (checkProjectId === undefined) {
                return resp.status(404).json({ error: "project not found" });
            }

            if (!name && !description && !projectRoot && !url) {
                return resp.status(204).json();
            }

            const parseResult = projectSchemaPatch.safeParse({name, description, projectRoot, url});
            if (!parseResult.success) { 
                return resp.status(400).json({ error: formatZodErrors(parseResult.error) });
            }

            const results = await projectStorage.update(projectId, name, description, projectRoot, url);
            if (results === undefined) {
                return resp.status(500).json({ error: 'Failed to patch project' });
            }

            return resp.status(204).json();

        } catch (err: any) {
            logger.error("[PATCH /project/:projectId] Fatal error: %o", err);
            return resp
                .status(500)
                .json({ error: err.message || 'Failed to patch project' });
        }
    })
}