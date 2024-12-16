import bodyParser from 'body-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { StaticAnalyzer } from '../orchestrators/static-analyzer.js';

const app: Express = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Endpoint for analyzing the Angular application
app.post('/analyze', async (req: Request, res: Response) => {
    const { projectRoot } = req.body;

    if (!projectRoot)
        return res.status(400).json({ error: 'Project root folder is required.' });

    try {
        // Define paths
        const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
        console.log(`tsconfig.json path: ${tsConfigPath}`);
        const outputDir = path.join(projectRoot, 'analysis');
        const outputFilePath = path.join(outputDir, 'graph.json');

         // Ensure the `tsconfig.json` exists
        if (!fs.existsSync(tsConfigPath))
            return res.status(400).json({ error: 'tsconfig.json not found in the specified root folder.' });

        // Create the analyzer and generate the graph
        const analyzer = new StaticAnalyzer(tsConfigPath);
        const navigationGraph = await analyzer.analyze();

        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Save the navigation graph
        fs.writeFileSync(outputFilePath, JSON.stringify(navigationGraph, null, 2), 'utf-8');

        res.json({ success: true, navigationGraph });
    } catch (error) {
        console.error('Error during analysis:', error);
        res.status(500).json({ error: 'Failed to analyze the application.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Backend API running at http://localhost:${port}`);
});