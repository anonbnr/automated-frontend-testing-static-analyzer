import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { StaticAnalyzer } from '../orchestrators/static-analyzer.js';

const app: Express = express();
const port = 3000;

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing (CORS)
app.use(bodyParser.json()); // Parse JSON request bodies

/**
 * POST /analyze
 * 
 * Analyzes an Angular application by generating a navigation graph based on its routes,
 * components, and interactions.
 * 
 * Request Body:
 * - `projectRoot` (string): Absolute path to the root directory of the Angular project.
 * 
 * Response:
 * - 200 OK: Returns a JSON object with the navigation graph.
 * - 400 Bad Request: If `projectRoot` is missing or `tsconfig.json` is not found.
 * - 500 Internal Server Error: If an error occurs during analysis.
 */
app.post('/analyze', async (req: Request, res: Response) => {
    const { projectRoot } = req.body;

    if (!projectRoot)
        return res.status(400).json({ error: 'Project root folder is required.' });

    try {
        // Define paths for TypeScript configuration and output files
        const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
        console.log(`tsconfig.json path: ${tsConfigPath}`);
        const outputDir = path.join(projectRoot, 'analysis');
        const outputFilePath = path.join(outputDir, 'graph.json');

        // Ensure the `tsconfig.json` file exists in the specified project root
        if (!fs.existsSync(tsConfigPath))
            return res.status(400).json({ error: 'tsconfig.json not found in the specified root folder.' });

        // Initialize the static analyzer and generate the navigation graph
        const analyzer = new StaticAnalyzer(tsConfigPath);
        const navigationGraph = await analyzer.analyze();

        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Save the navigation graph as a JSON file
        fs.writeFileSync(outputFilePath, JSON.stringify(navigationGraph, null, 2), 'utf-8');

        // Return the generated navigation graph as the response
        res.json({ success: true, navigationGraph });
    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: 'Failed to analyze the application.' });
    }
});

/**
 * Starts the Express server on the specified port.
 */
app.listen(port, () => {
    console.log(`Backend API running at http://localhost:${port}`);
});