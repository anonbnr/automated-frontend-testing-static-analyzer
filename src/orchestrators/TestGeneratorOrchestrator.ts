// src/orchestrators/TestGeneratorOrchestrator.ts
import { TestScriptGeneratorFactory } from '../generators/TestScriptGeneratorFactory.js';
import { TestGenerationOptions } from '../generators/TestScriptGenerator.js';
import * as fs from 'fs';
import * as path from 'path';

export class TestGeneratorOrchestrator {
  private type: string;
  private options: TestGenerationOptions;

  constructor(type: string, options: TestGenerationOptions) {
    this.type = type;
    this.options = options;
  }

  async generate(): Promise<{ script: string, fileExtension: string, outputPath?: string }> {
    // Create the appropriate generator
    const generator = TestScriptGeneratorFactory.createGenerator(this.type, this.options);
    
    // Generate the script
    const script = await generator.generateScript();
    
    // Get the file extension
    const fileExtension = generator.getFileExtension();
    
    return {
      script,
      fileExtension,
      outputPath: this.options.outputPath ? 
        path.join(this.options.outputPath, `test_script${fileExtension}`) : 
        undefined
    };
  }

  static getSupportedTypes(): string[] {
    return TestScriptGeneratorFactory.getSupportedTypes();
  }
}
