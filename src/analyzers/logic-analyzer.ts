import * as ts from 'ts-morph';

export class LogicAnalyzer {
    analyze(file: ts.SourceFile): Map<string, string[]> {
        const handlers = new Map<string, string[]>();

        // Parse logic using ts-morph
        for (const cls of file.getClasses()) {
            for (const method of cls.getMethods()) {
                const methodName = method.getName();
                const normalizedMethodName = methodName.replace(/\(\)$/, ''); // Normalize name
                // console.log('Normalized handler (LogicAnalyzer):', normalizedMethodName);

                // Extract navigation calls
                const navigateCalls = method.getDescendantsOfKind(ts.SyntaxKind.CallExpression)
                    .filter((call) => call.getExpression().getText().includes('navigate'))
                    .map((call) => call.getArguments()
                        .map((arg) => arg.getText()
                            .replace(/['"`]/g, '')
                            .replace(/^\[|\]$/g, ''))); // Normalize route format and remove brackets
                
                if (navigateCalls.length > 0) {
                    // console.log('Extracted routes:', navigateCalls.flat()); // Debug extracted routes
                    handlers.set(normalizedMethodName, navigateCalls.flat());
                }
            }
        }

        return handlers;
    }
}