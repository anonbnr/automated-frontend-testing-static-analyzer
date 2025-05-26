export interface TestGenerationOptions {
    formData: any;
    baseUrl: string;
    outputPath?: string;
    waitTimeout?: number;
    customOptions?: Record<string, any>;
  }
  
  export abstract class TestScriptGenerator {
    protected options: TestGenerationOptions;
  
    constructor(options: TestGenerationOptions) {
      this.options = {
        waitTimeout: 10, // Default timeout
        ...options
      };
    }
  
    abstract generateScript(): Promise<string>;
    abstract getFileExtension(): string;
    abstract getSupportedType(): string;
  }
  