import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';
import { projectSchemaPatch } from '../schemas/projectSchema.js';
import { formatZodErrors } from '../../../adapters/utils/schema.js';

export default function buildRoute(router: Router) {

    router.patch('/projects/:projectId', async (req: Request, res: Response) => {

        const { name, description, projectRoot, url } = req.body as { name: string, description: string, projectRoot: string, url: string }
        const projectId = req.params.projectId;

        try {

            const checkProjectId = await projectRegistry.getById(projectId);
            if (checkProjectId === undefined) {
                return res.status(404).json({ error: "project not found" });
            }

            if (!name && !description && !projectRoot && !url) {
                return res.status(204).json();
            }

            const parseResult = projectSchemaPatch.safeParse({name, description, projectRoot, url});
            if (!parseResult.success) { 
                return res.status(400).json({ error: formatZodErrors(parseResult.error) });
            }

            const results = await projectRegistry.update(projectId, name, description, projectRoot, url);
            if (results === undefined) {
                return res.status(500).json({ error: 'Failed to patch project' });
            }

            return res.status(204).json();

        } catch (err: any) {
            logger.error("[PATCH /project/:projectId] Fatal error: %o", err);
            return res
                .status(500)
                .json({ error: err.message || 'Failed to patch project' });
        }
    })
}