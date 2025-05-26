import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';

export class ScreenshotService {
  private screenshotDir: string;
  private angularProcess: ChildProcess | null = null;
  private frontendFolder: string;

  constructor(frontendFolder: string) {
    this.frontendFolder = frontendFolder; // Dossier uploadé du frontend
    this.screenshotDir = path.join(process.cwd(), 'temp', 'screenshots');
    this.ensureScreenshotDir();
  }

  /**
   * Capture automatique de toutes les routes depuis le dossier uploadé
   */
  async captureAllRoutes(routes: string[], baseUrl: string = 'http://localhost:4200'): Promise<{ [route: string]: string }> {
    console.log(`🚀 Starting screenshot capture for ${routes.length} routes from uploaded folder: ${this.frontendFolder}`);
    
    // 1. Vérifier que le dossier uploadé contient bien un projet Angular
    if (!this.isValidAngularProject()) {
      throw new Error(`Invalid Angular project in folder: ${this.frontendFolder}`);
    }
    
    // 2. Vérifier/Démarrer l'application Angular depuis le dossier uploadé
    const isAppRunning = await this.checkIfAppIsRunning(baseUrl);
    if (!isAppRunning) {
      console.log('📦 Angular app not running, starting from uploaded folder...');
      await this.startAngularAppFromUploadedFolder();
      await this.waitForAppToBeReady(baseUrl);
    }
    
    // 3. Capturer les routes
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
      }
    });
    
    const results: { [route: string]: string } = {};
    
    try {
      for (const route of routes) {
        try {
          console.log(`📸 Capturing screenshot for route: ${route}`);
          const screenshotPath = await this.captureRoute(browser, route, baseUrl);
          results[route] = screenshotPath;
          console.log(`✅ Screenshot saved: ${screenshotPath}`);
        } catch (error) {
          console.error(`❌ Failed to capture ${route}:`, error);
          results[route] = 'error';
        }
      }
    } finally {
      await browser.close();
    }
    
    console.log(`🎉 Screenshot capture completed! ${Object.keys(results).length} routes processed.`);
    return results;
  }

  /**
   * Vérifier que le dossier uploadé est un projet Angular valide
   */
  private isValidAngularProject(): boolean {
    const packageJsonPath = path.join(this.frontendFolder, 'package.json');
    const angularJsonPath = path.join(this.frontendFolder, 'angular.json');
    
    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(angularJsonPath)) {
      console.error('❌ Missing package.json or angular.json in uploaded folder');
      return false;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (!packageJson.dependencies || !packageJson.dependencies['@angular/core']) {
        console.error('❌ Not an Angular project (missing @angular/core dependency)');
        return false;
      }
      
      console.log('✅ Valid Angular project detected');
      return true;
    } catch (error) {
      console.error('❌ Invalid package.json in uploaded folder');
      return false;
    }
  }

  /**
   * Démarrer l'application Angular depuis le dossier uploadé
   */
  private async startAngularAppFromUploadedFolder(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔄 Starting Angular application from: ${this.frontendFolder}`);
      
      // Installer les dépendances si node_modules n'existe pas
      const nodeModulesPath = path.join(this.frontendFolder, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        console.log('📦 Installing dependencies first...');
        this.installDependencies().then(() => {
          this.startAngularServe(resolve, reject);
        }).catch(reject);
      } else {
        this.startAngularServe(resolve, reject);
      }
    });
  }

  /**
   * Installer les dépendances du projet uploadé
   */
  private async installDependencies(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('⬇️ Installing npm dependencies...');
      
      const npmProcess = spawn('npm', ['install'], {
        cwd: this.frontendFolder, // 🎯 Exécuter depuis le dossier uploadé
        stdio: 'pipe'
      });
      
      npmProcess.stdout?.on('data', (data) => {
        console.log('NPM output:', data.toString());
      });
      
      npmProcess.stderr?.on('data', (data) => {
        console.error('NPM error:', data.toString());
      });
      
      npmProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Dependencies installed successfully');
          resolve();
        } else {
          reject(new Error(`NPM install failed with code ${code}`));
        }
      });
      
      npmProcess.on('error', (error) => {
        console.error('Failed to install dependencies:', error);
        reject(error);
      });
    });
  }

  /**
   * Lancer ng serve depuis le dossier uploadé
   */
  private startAngularServe(resolve: Function, reject: Function): void {
  // Démarrer ng serve depuis le dossier uploadé
  this.angularProcess = spawn('ng', ['serve', '--port=4200'], {
    cwd: this.frontendFolder,
    detached: false,
    stdio: 'pipe'
  });
  
  let appStarted = false;
  
  this.angularProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    console.log('Angular output:', output);
    
    // ✅ AMÉLIORER la détection des messages de succès
    const successPatterns = [
      'compiled successfully',     // ✔ Compiled successfully
      'Compiled successfully',     // Compiled successfully
      'listening on localhost',    // Angular Live Development Server is listening on localhost
      'Local:',                   // Local: http://localhost:4200/
      'served successfully',       // served successfully
      'Development Server is listening' // Angular Live Development Server is listening
    ];
    
    const isAppReady = successPatterns.some(pattern => 
      output.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (isAppReady && !appStarted) {
      appStarted = true;
      console.log('✅ Angular app started successfully from uploaded folder');
      resolve();
    }
  });
  
  this.angularProcess.stderr?.on('data', (data) => {
    const errorOutput = data.toString();
    console.log('Angular stderr:', errorOutput); // Changé en log au lieu d'error
    
    // Seulement rejeter sur les vraies erreurs fatales
    if (errorOutput.toLowerCase().includes('error') && 
        !errorOutput.toLowerCase().includes('warning') &&
        !errorOutput.toLowerCase().includes('this is a simple server')) { // Ignorer le message de sécurité
      reject(new Error(`Angular build error: ${errorOutput}`));
    }
  });
  
  this.angularProcess.on('error', (error) => {
    console.error('Failed to start Angular app:', error);
    reject(error);
  });
  
  // ✅ AUGMENTER le timeout car Angular peut prendre du temps
  setTimeout(() => {
    if (!appStarted) {
      console.log('🕐 Angular app did not start within timeout, but it might still be building...');
      reject(new Error('Angular app failed to start within timeout (90s)'));
    }
  }, 90000); // 90 secondes timeout au lieu de 60
}


  /**
   * Capture une route spécifique
   */
  /**
 * Capture une route spécifique
 */
private async captureRoute(browser: any, route: string, baseUrl: string): Promise<string> {
  const page = await browser.newPage();
  
  try {
    // Configuration de la page
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Aller à la route
    const fullUrl = `${baseUrl}${route}`;
    console.log(`🌐 Navigating to: ${fullUrl}`);
    
    await page.goto(fullUrl, { 
      waitUntil: 'networkidle0', // Attendre que le réseau soit idle
      timeout: 30000 
    });
    
    // ✅ REMPLACER page.waitForTimeout par delay
    await this.delay(2000);
    
    // Masquer les éléments qui bougent (curseurs, loaders, etc.)
    await page.addStyleTag({
      content: `
        * { 
          animation-duration: 0s !important; 
          animation-delay: 0s !important; 
          transition-duration: 0s !important; 
          transition-delay: 0s !important; 
        }
        .mat-progress-bar, .mat-spinner { display: none !important; }
      `
    });
    
    // Générer le nom du fichier
    const fileName = this.routeToFileName(route);
    const screenshotPath = path.join(this.screenshotDir, `${fileName}.png`);
    
    // Prendre le screenshot de toute la page
    await page.screenshot({
      path: screenshotPath,
      fullPage: true, // 📄 Capture toute la page, même longue
      type: 'png',    // 📸 Meilleure qualité
    });
    
    return screenshotPath;
    
  } finally {
    await page.close();
  }
}

/**
 * ✅ AJOUTER cette méthode delay
 * Fonction de délai compatible avec toutes les versions de Puppeteer
 */
private delay(time: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}


  /**
   * Vérifier si l'app Angular est running
   */
/**
 * Vérifier si l'app Angular est running
 */
private async checkIfAppIsRunning(baseUrl: string): Promise<boolean> {
  try {
    // ✅ Utiliser AbortController pour le timeout avec node-fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(baseUrl, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}


  /**
   * Attendre que l'app soit prête
   */
  private async waitForAppToBeReady(baseUrl: string): Promise<void> {
    const maxRetries = 30; // 30 secondes
    let retries = 0;
    
    while (retries < maxRetries) {
      const isReady = await this.checkIfAppIsRunning(baseUrl);
      if (isReady) {
        console.log('✅ Angular app is ready for screenshots');
        return;
      }
      
      console.log(`⏳ Waiting for app to be ready... (${retries + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }
    
    throw new Error('Angular app did not become ready within timeout');
  }

  /**
   * Convertir route en nom de fichier valide
   */
  private routeToFileName(route: string): string {
    return route
      .replace(/^\//, '') // Enlever le slash initial
      .replace(/\//g, '_') // Remplacer les slashes par des underscores
      .replace(/[:<>"|?*]/g, '_') // Remplacer les caractères invalides
      .replace(/_+/g, '_') // Remplacer les underscores multiples
      .toLowerCase() || 'root'; // Fallback pour la route racine
  }

  /**
   * Récupérer le screenshot d'une route
   */
  async getScreenshot(route: string): Promise<Buffer | null> {
    const fileName = this.routeToFileName(route);
    const screenshotPath = path.join(this.screenshotDir, `${fileName}.png`);
    
    if (fs.existsSync(screenshotPath)) {
      return fs.readFileSync(screenshotPath);
    }
    
    return null;
  }

  /**
   * S'assurer que le dossier de screenshots existe
   */
  private ensureScreenshotDir(): void {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
      console.log(`📁 Created screenshot directory: ${this.screenshotDir}`);
    }
  }

  /**
   * Nettoyer les ressources
   */
  cleanup(): void {
    if (this.angularProcess && !this.angularProcess.killed) {
      console.log('🛑 Stopping Angular process...');
      this.angularProcess.kill();
    }
    
    // NE PAS supprimer les screenshots automatiquement
    // Ils seront supprimés au shutdown du serveur
    console.log('🧹 Angular process cleanup completed');
  }
}
