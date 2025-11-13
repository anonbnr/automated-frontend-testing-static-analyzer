import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { resolveTsConfig } from '../../utils.js';
import { StaticAnalyzer } from '../../../orchestrators/static-analyzer.js';
import { getNavigationGraph, setNavigationGraph } from '../../../adapters/appCache.js';
import * as projectStorage from '../../../adapters/storage/projectStorage.js';
import * as moduleStorage from '../../../adapters/storage/moduleStorage.js';
import * as componentStorage from '../../../adapters/storage/componentStorage.js';
import * as graphStorage from '../../../adapters/storage/graphStorage.js';
import * as widgetStorage from '../../../adapters/storage/widgetStorage.js';
import * as componentRouteStorage from '../../../adapters/storage/componentRouteStorage.js';
import * as redirectRouteStorage from '../../../adapters/storage/redirectRouteStorage.js';
import * as routeRoleStorage from '../../../adapters/storage/routeRoleStorage.js';
import { AnalysisProject } from '../../../models/project-info.js';


export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/analysis', async (req: Request, resp: Response) => {

        const projectId = req.params.projectId;
        
        const project = await projectStorage.getById(projectId);
        
        if (project === undefined) {
            return resp.status(404).json({ success: false, error: 'project not found' });
        }
        
        const tsConfig = resolveTsConfig(project.projectRoot);
        if (!tsConfig) {
            logger.warn(
                "[POST /graph] tsconfig.json not found under %s",
                project.projectRoot
            );
            return resp
                .status(400)
                .json({ success: false, error: 'tsconfig.json not found in projectRoot' });
        }

        try {
            const analyzer = new StaticAnalyzer(tsConfig);
            
            // Check cache to avoid redundant analysis
                
            const graph = await analyzer.analyze();
            const modules = analyzer.modRegistry.modules;
            const components = analyzer.compRegistry.components;
            const compRouteMap = analyzer.compRouteMap;
            const routeMap = compRouteMap.routeMap;
            const roles = {
                root: compRouteMap.roles.root.map(c => c.selector),
                global: compRouteMap.roles.global.map(c => c.selector),
                shared: compRouteMap.roles.shared.map(c => c.selector),
                mapped: compRouteMap.roles.mapped.map(c => c.selector),
                dead: compRouteMap.roles.dead.map(c => c.selector)
            }

            for (const module of modules) {
                await moduleStorage.save(projectId, module);
            }

            for (const component of components) {
                await componentStorage.save(projectId, component);

                for (const widget of component.widgets) {
                    await widgetStorage.save(projectId, widget, component.selector, undefined);

                    if (widget.children) {
                        for (const children of widget.children) {
                            await widgetStorage.save(projectId, children, component.selector, widget.id);
                        }
                    }
                }
            }

            for (const componentRoute of routeMap.routes) {
                await componentRouteStorage.save(projectId, componentRoute);
            }
            for (const redirectRoute of routeMap.redirections) {
                await redirectRouteStorage.save(projectId, redirectRoute);
            }

            await routeRoleStorage.save(projectId, roles)

            graphStorage.save(projectId, graph);

            return resp.status(204).json();
        } catch (err: any) {
            // Unhandled error: log and return 500
            logger.error('[POST /graph] Error building graph: %o', err);
            return resp
                .status(500)
                .json(err.message || 'Failed to analyse the project');
        }
    })
}


