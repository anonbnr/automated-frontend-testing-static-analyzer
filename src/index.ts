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
/**
 * Cleanup des screenshots au shutdown du serveur
 */
function cleanupScreenshots() {
  const screenshotDir = path.join(process.cwd(), 'temp', 'screenshots');
  if (fs.existsSync(screenshotDir)) {
    fs.rmSync(screenshotDir, { recursive: true, force: true });
    console.log('🗑️ Cleaned up screenshot directory on server shutdown');
  }
}

// Gérer les signaux de shutdown
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  cleanupScreenshots();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Server terminating...');
  cleanupScreenshots();
  process.exit(0);
});

// Cleanup sur exit normal
process.on('exit', () => {
  cleanupScreenshots();
});
main().catch((err) => console.error(err));