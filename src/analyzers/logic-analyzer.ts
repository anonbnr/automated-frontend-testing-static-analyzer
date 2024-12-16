import * as ts from 'ts-morph';

export class LogicAnalyzer {
    analyze(file: ts.SourceFile): Map<string, string[]> {
        const handlers = new Map<string, string[]>();

        // Parse logic using ts-morph
        for (const cls of file.getClasses()) {
            for (const method of cls.getMethods()) {
                const methodName = method.getName();
                const calls = method.getDescendantsOfKind(ts.SyntaxKind.CallExpression)
                    .filter((call) => call.getExpression().getText().includes('navigate'))
                    .map((call) => call.getArguments()
                        .map((arg) => arg.getText()
                            .replace(/['"`]/g, '')
                            .replace(/^\[|\]$/g, ''))); // Normalize route format and remove brackets

                if (calls.length > 0) {
                    const normalizedMethodName = methodName.replace(/\(\)$/, ''); // Normalize name
                    // console.log('Normalized handler (LogicAnalyzer):', normalizedMethodName);
                    const extractedRoutes = calls.flat();
                    // console.log('Extracted routes:', extractedRoutes); // Debug extracted routes
                    handlers.set(normalizedMethodName, extractedRoutes);
                }
            }
        }

        return handlers;
    }
}