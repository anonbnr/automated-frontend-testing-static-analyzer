import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Project } from 'ts-morph';
import { RouteAnalyzer } from '../analyzers/routes/route-analyzer.js';
import { ComponentRegistryBuilder } from '../builders/component-registry-builder.js';
import { ComponentRegistry } from '../models/component-info.js';
import { AppNavigation } from '../models/navigation-graph.js';
import { ComponentRouteMap } from '../models/route-info.js';
import { StaticAnalyzer } from '../orchestrators/static-analyzer.js';

const app: Express = express();
const port = process.env.PORT ?? 3000;

app.use(cors());
app.use(bodyParser.json());

// utility to ensure tsconfig exists
function resolveTsConfig(projectRoot: string): string | null {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    return fs.existsSync(tsConfigPath) ? tsConfigPath : null;
}

/**
 * POST /components
 *
 * Discovers every @Component in the workspace and returns the full registry.
 *
 * Request body:
 *   { projectRoot: string }
 *
 * Response 200:
 *   {
 *     success: true,
 *     components: ComponentInfo[]
 *   }
 */
app.post('/components', async (req: Request, res: Response) => {
    const { projectRoot } = req.body;
    if (!projectRoot) {
        return res.status(400).json({ error: '`projectRoot` is required' });
    }

    const tsConfigPath = resolveTsConfig(projectRoot);
    if (!tsConfigPath) {
        return res.status(400).json({ error: '`tsconfig.json` not found' });
    }

    try {
        const project = new Project({ tsConfigFilePath: tsConfigPath });
        const registry: ComponentRegistry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        return res.json({ success: true, components: registry.components });
    } catch (err: any) {
        console.error('[/components] error:', err);
        return res.status(500).json({ error: 'Failed to build component registry', details: err.message });
    }
});

/**
 * POST /routes
 *
 * Runs the RouteAnalyzer and returns a full ComponentRouteMap.
 *
 * Request body:
 *   { projectRoot: string }
 *
 * Response 200:
 *   {
 *     success: true,
 *     routeMap: {
 *       routes: ComponentRoute[],
 *       redirections: RedirectRoute[],
 *       roles: {
 *         root: string[],    // selector of <app-root>
 *         global: string[],  // selectors present on every route
 *         shared: string[],  // selectors on multiple but not all routes
 *         mapped: string[],  // selectors tied to exactly one route
 *         dead: string[]     // selectors never used
 *       }
 *     }
 *   }
 */
app.post('/routes', async (req: Request, res: Response) => {
    const { projectRoot } = req.body;
    if (!projectRoot) {
        return res.status(400).json({ error: '`projectRoot` is required' });
    }

    const tsConfigPath = resolveTsConfig(projectRoot);
    if (!tsConfigPath) {
        return res.status(400).json({ error: '`tsconfig.json` not found' });
    }

    try {
        const project = new Project({ tsConfigFilePath: tsConfigPath });
        const registry: ComponentRegistry = await new ComponentRegistryBuilder(project).buildComponentsRegistry();
        const analyzer = new RouteAnalyzer(project);
        const compRouteMap: ComponentRouteMap = await analyzer.analyzeProject(registry);

        // Shallow‐serialize the new roles record
        const dump = {
            routes: compRouteMap.routeMap.routes,
            redirections: compRouteMap.routeMap.redirections,
            roles: {
                root: compRouteMap.roles.root.map(c => c.selector),
                global: compRouteMap.roles.global.map(c => c.selector),
                shared: compRouteMap.roles.shared.map(c => c.selector),
                mapped: compRouteMap.roles.mapped.map(c => c.selector),
                dead: compRouteMap.roles.dead.map(c => c.selector),
            }
        };

        return res.json({ success: true, routeMap: dump });
    } catch (err: any) {
        console.error('[/routes] error:', err);
        return res.status(500).json({ error: 'Failed to analyze routes', details: err.message });
    }
});

/**
 * POST /graph
 *
 * Runs the full StaticAnalyzer pipeline and returns the navigation graph.
 *
 * Request body:
 *   { projectRoot: string }
 *
 * Response 200:
 *   {
 *     success: true,
 *     graph: AppNavigation
 *   }
 */
app.post('/graph', async (req: Request, res: Response) => {
    const { projectRoot } = req.body;
    if (!projectRoot) {
        return res.status(400).json({ error: '`projectRoot` is required' });
    }

    const tsConfigPath = resolveTsConfig(projectRoot);
    if (!tsConfigPath) {
        return res.status(400).json({ error: '`tsconfig.json` not found' });
    }

    try {
        const analyzer = new StaticAnalyzer(tsConfigPath);
        const graph: AppNavigation = await analyzer.analyze();
        return res.json({ success: true, graph });
    } catch (err: any) {
        console.error('[/graph] error:', err);
        return res.status(500).json({ error: 'Failed to build navigation graph', details: err.message });
    }
});

/**
 * Optional: POST /scenarios
 *
 * If you later implement ScenarioExtractor, you can wire it up here.
 *
 * app.post('/scenarios', (req, res) => {
 *   const graph = req.body.graph as AppNavigation;
 *   if (!graph) return res.status(400).json({ error: '`graph` is required' });
 *   try {
 *     const scenarios = new ScenarioExtractor(graph).extract();
 *     res.json({ success: true, scenarios });
 *   } catch (err) {
 *     res.status(500).json({ error: 'Failed to extract scenarios', details: err.message });
 *   }
 * });
 */

app.listen(port, () => {
    console.log(`🚀 API listening on http://localhost:${port}`);
});