import { Request, Response, Router } from 'express';
import logger from '../../../logging/logger.js';
import { resolveTsConfig } from '../../utils.js';
import { StaticAnalyzer } from '../../../orchestrators/static-analyzer.js';
//import { getNavigationGraph, setNavigationGraph } from '../../../adapters/appCache.js';
import * as projectStorage from '../../../adapters/storage/project-storage.js';
import * as moduleStorage from '../../../adapters/storage/module-storage.js';
import * as componentStorage from '../../../adapters/storage/component-storage.js';
import * as graphStorage from '../../../adapters/storage/graph-storage.js';
import * as widgetStorage from '../../../adapters/storage/widget-storage.js';
import * as componentRouteStorage from '../../../adapters/storage/component-route-storage.js';
import * as redirectRouteStorage from '../../../adapters/storage/redirect-route-storage.js';
import * as routeRoleStorage from '../../../adapters/storage/route-role-storage.js';
import * as userJourneyStorage from '../../../adapters/storage/user-journey-storage.js';
import { AnalysisProject } from '../../../models/project-info.js';
import { UserJourneyRegistryBuilder } from '../../../builders/user-journeys/user-journey-registry-builder.js';
import { StorageSession } from '../../../adapters/storageManager.js';
import * as storageManager from '../../../adapters/storageManager.js';
import { WidgetInfo } from '../../../models/widget-info.js';
import { ComponentInfo } from '../../../models/component-info.js';
import { inferExpandedSteps } from '../../../builders/user-journeys/user-journey-expanded-step-inferer.js';
import { flattenWidgets } from '../utils/widgets.js';

export default function buildRoute(router: Router) {

    router.post('/projects/:projectId/analysis', async (req: Request, resp: Response) => {

        let storageSession: StorageSession | undefined;

        const projectId = req.params.projectId;
        const fanoutMode = req.body.fanoutMode ?? "primary"

        try {
            storageSession = await storageManager.getSession();

            const project = await projectStorage.getById(projectId, storageSession);

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

            await storageSession.beginTransaction();

            await Promise.all([
                moduleStorage.deleteByProjectId(projectId, storageSession),
                componentStorage.deleteByProjectId(projectId, storageSession),
                redirectRouteStorage.deleteByProjectId(projectId, storageSession),
                userJourneyStorage.deleteByProjectId(projectId, storageSession),
                graphStorage.deleteByProjectId(projectId, storageSession),
                routeRoleStorage.deleteByProjectId(projectId, storageSession),
            ]);

            await storageSession.commit();

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
            const userJourneys = new UserJourneyRegistryBuilder(
                compRouteMap,
                graph,
                fanoutMode
            ).build().getAll();

            for (const userJourney of userJourneys) {
                const widgets: WidgetInfo[] = [];

                for (const step of userJourney.steps) {
                    if (step.stepType === "component") {
                        const component = components.find(component => component.selector === step.nodeId);
                        if (component?.widgets)
                            widgets.push(...flattenWidgets(component?.widgets));
                    }
                }
                userJourney.expandedSteps = inferExpandedSteps(userJourney.steps, widgets);
            }

            await storageSession.beginTransaction();

            for (const module of modules) {
                await moduleStorage.save(projectId, module, storageSession);
            }

            for (const component of components) {
                await componentStorage.save(projectId, component, storageSession);

                for (const widget of component.widgets) {
                    await widgetStorage.save(projectId, widget, component.selector, storageSession, undefined);

                    if (widget.children) {
                        for (const children of widget.children) {
                            await widgetStorage.save(projectId, children, component.selector, storageSession, widget.id);
                        }
                    }
                }
            }

            for (const componentRoute of routeMap.routes) {
                await componentRouteStorage.save(projectId, componentRoute, storageSession);
            }
            for (const redirectRoute of routeMap.redirections) {
                await redirectRouteStorage.save(projectId, redirectRoute, storageSession);
            }

            await routeRoleStorage.save(projectId, roles, storageSession)

            graphStorage.save(projectId, graph, storageSession);

            for (const userJourney of userJourneys) {
                await userJourneyStorage.save(projectId, userJourney, storageSession);
            }

            await projectStorage.updateScanDate(projectId, storageSession);

            await storageSession.commit();

            return resp.status(204).json();
        } catch (err: any) {
            await storageSession?.rollback();

            // Unhandled error: log and return 500
            logger.error('[DELETE /project/:projectId/analysis] Fatal error: %o', err);
            return resp
                .status(500)
                .json(err.message || 'Failed to analyse the project');
        } finally {
            storageSession?.ends();
        }
    })
}


