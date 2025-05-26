import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { StaticAnalyzer } from '../orchestrators/static-analyzer.js';
import { TestGeneratorOrchestrator } from '../orchestrators/TestGeneratorOrchestrator.js';
import { TestScriptGeneratorFactory } from '../generators/TestScriptGeneratorFactory.js';
import { ScreenshotService } from '../services/ScreenshotService.js';

const app: Express = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

/**
 * POST /analyze
 * Analyse une application Angular et génère le graphe de navigation.
 * Body: { projectRoot: string }
 */
app.post('/analyze', async (req: Request, res: Response) => {
  const { projectRoot } = req.body;
  if (!projectRoot)
    return res.status(400).json({ error: 'Project root folder is required.' });

  try {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    const outputDir = path.join(projectRoot, 'analysis');
    const outputFilePath = path.join(outputDir, 'graph.json');

    if (!fs.existsSync(tsConfigPath))
      return res.status(400).json({ error: 'tsconfig.json not found in the specified root folder.' });

    const analyzer = new StaticAnalyzer(tsConfigPath);
    const navigationGraph = await analyzer.analyze();

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, JSON.stringify(navigationGraph, null, 2), 'utf-8');

    res.json({ success: true, navigationGraph });
  } catch (error) {
    console.error('Error during analysis:', error);
    res.status(500).json({ error: 'Failed to analyze the application.' });
  }
});

/**
 * POST /generate-test-script
 * Génère un script de test à partir d'un scénario JSON et de l'outil choisi.
 * Body: { scenario: any, tool: string, baseUrl?: string }
 */
app.post('/generate-test-script', async (req: Request, res: Response) => {
  try {
    const { scenario, tool, baseUrl } = req.body;
    if (!scenario || !tool) {
      return res.status(400).json({ error: 'Scenario and tool are required.' });
    }

    // Prépare les options pour le générateur
    const options = {
      formData: scenario,
      baseUrl: baseUrl || 'http://localhost:4200', // Valeur par défaut, à adapter
    };

    // Utilise l'orchestrateur pour générer le script
    const orchestrator = new TestGeneratorOrchestrator(tool, options);
    const { script, fileExtension } = await orchestrator.generate();

    res.json({ script, fileExtension });
  } catch (err: any) {
    console.error('Error generating test script:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/capture-screenshots', async (req, res) => {
  try {
    const { routes, frontendFolder } = req.body;
    
    if (!routes || !Array.isArray(routes)) {
      return res.status(400).json({ error: 'Routes array is required' });
    }
    
    if (!frontendFolder) {
      return res.status(400).json({ error: 'Frontend folder path is required' });
    }
    
    console.log('📸 Starting screenshot capture via API...');
    const screenshotService = new ScreenshotService(frontendFolder);
    const results = await screenshotService.captureAllRoutes(routes);
    
    console.log('✅ Screenshot capture completed via API');
    
    res.json({ 
      success: true, 
      results,
      message: `Captured ${Object.keys(results).length} routes` 
    });
    
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    // ✅ CORRIGER l'erreur TypeScript
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/screenshots/:route(*)', async (req, res) => {
  try {
    const route = '/' + (req.params.route || '');
    
    const screenshotService = new ScreenshotService('');
    const screenshotBuffer = await screenshotService.getScreenshot(route);
    
    if (screenshotBuffer) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(screenshotBuffer);
    } else {
      res.status(404).json({ error: 'Screenshot not found' });
    }
    
  } catch (error) {
    console.error('❌ Error serving screenshot:', error);
    // ✅ CORRIGER l'erreur TypeScript
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});
/**
 * Vérifier si les screenshots existent déjà
 */
app.post('/check-screenshots', async (req, res) => {
  try {
    const { routes } = req.body;
    
    if (!routes || !Array.isArray(routes)) {
      return res.status(400).json({ error: 'Routes array is required' });
    }
    
    const screenshotDir = path.join(process.cwd(), 'temp', 'screenshots');
    const existingScreenshots: { [route: string]: boolean } = {};
    
    // Vérifier chaque route
    routes.forEach((route: string) => {
      const fileName = route
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/[:<>"|?*]/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase() || 'root';
      
      const screenshotPath = path.join(screenshotDir, `${fileName}.png`);
      existingScreenshots[route] = fs.existsSync(screenshotPath);
    });
    
    const allExist = Object.values(existingScreenshots).every(exists => exists);
    
    res.json({ 
      allExist,
      existingScreenshots,
      message: allExist ? 'All screenshots exist' : 'Some screenshots missing'
    });
    
  } catch (error) {
    console.error('❌ Error checking screenshots:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});


app.listen(port, () => {
  console.log(`Backend API running at http://localhost:${port}`);
});
