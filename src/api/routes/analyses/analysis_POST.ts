import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import * as projectRegistry from '../../../adapters/registries/projectRegistry.js';
import { resolveTsConfig } from '../../utils.js';
import { StaticAnalyzer } from '../../../orchestrators/static-analyzer.js';
import { getNavigationGraph, setNavigationGraph } from '../../../adapters/appCache.js';
import * as moduleRegistry from '../../../adapters/registries/moduleRegistry.js';

export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/analysis', async (req: Request, res: Response) => {

        const projectId = req.params.projectId;

        const { projectRoot } = req.body as { projectRoot?: string };

        if (!projectRoot) {
            return res
                .status(400)
                .json({ success: false, error: 'projectRoot is required' });
        }

        const tsConfig = resolveTsConfig(projectRoot);
        if (!tsConfig) {
            logger.warn(
                "[POST /graph] tsconfig.json not found under %s",
                projectRoot
            );
            return res
                .status(400)
                .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
        }

        try {
            const analyzer = new StaticAnalyzer(tsConfig);
            
            // Check cache to avoid redundant analysis
            
            
            const graph = await analyzer.analyze();
            const module = analyzer.modRegistry.modules[0];
            moduleRegistry.save(module.name, projectId, module.filePath, module.imports, module.declarations, module.exports, module.lazy, module.role);

            return res.json({ success: true, graph });
        } catch (err: any) {
            // Unhandled error: log and return 500
            logger.error('[POST /graph] Error building graph: %o', err);
            return res
                .status(500)
                .json({ success: false, error: err.message || 'Failed to build navigation graph' });
        }
    })
}


