import * as fs from "fs";
import * as path from "path";
import { StaticAnalyzer } from "./orchestrators/static-analyzer.js";

async function main() {
  const tsConfigPath = '../tsconfig.json';
  const outputFilePath = '../assets/json/graph.json';
  const analyzer = new StaticAnalyzer(tsConfigPath);
  
  const navigationGraph = await analyzer.analyze();

  console.log('Extracted Navigation Graph:', JSON.stringify(navigationGraph, null, 2));

  // Ensure the directory exists
  ensureDirectoryExists(path.dirname(outputFilePath));

  // Write the navigation graph to the JSON file
  fs.writeFileSync(outputFilePath, JSON.stringify(navigationGraph, null, 2), 'utf-8');
  console.log(`Navigation graph saved to ${outputFilePath}`);
}

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

main().catch((err) => console.error(err));