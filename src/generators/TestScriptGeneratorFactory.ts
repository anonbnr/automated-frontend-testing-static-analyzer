// src/generators/TestScriptGeneratorFactory.ts
import { TestScriptGenerator, TestGenerationOptions } from './TestScriptGenerator.js';
import { SeleniumGenerator } from './SeleniumGenerator.js';
import { PuppeteerGenerator } from './PuppeteerGenerator.js';

export class TestScriptGeneratorFactory {
  private static generators: Map<string, new (options: TestGenerationOptions) => TestScriptGenerator> = new Map();

  static {
    // Register available generators
    this.registerGenerator('selenium', SeleniumGenerator);
    this.registerGenerator('puppeteer', PuppeteerGenerator);
  }

  static registerGenerator(type: string, generatorClass: new (options: TestGenerationOptions) => TestScriptGenerator): void {
    this.generators.set(type.toLowerCase(), generatorClass);
  }

  static createGenerator(type: string, options: TestGenerationOptions): TestScriptGenerator {
    const GeneratorClass = this.generators.get(type.toLowerCase());
    
    if (!GeneratorClass) {
      throw new Error(`No generator found for type: ${type}`);
    }
    
    return new GeneratorClass(options);
  }

  static getSupportedTypes(): string[] {
    return Array.from(this.generators.keys());
  }
}
