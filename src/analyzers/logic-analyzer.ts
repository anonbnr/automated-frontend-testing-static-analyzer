import * as ts from 'ts-morph';
import { EventContext, EventHandlerCallContext, WidgetEventMap, WidgetInfo } from '../models/widget-info.js';

export class LogicAnalyzer {
    analyze(file: ts.SourceFile, widgets: WidgetInfo[]): WidgetEventMap[] {
        const widgetEventMaps: WidgetEventMap[] = [];
        const methods = this.extractMethods(file);

        for (const widget of widgets){
            const eventContexts: EventContext[] = [];

            for (const [event, handler] of widget.events){
                if (event === "routerLink") continue;
                const handlerBody = methods.get(handler);

                if (handlerBody){
                    const calls = this.extractHandlerCalls(handlerBody);
                    eventContexts.push({
                        event,
                        handler,
                        calls
                    });
                }
                else
                    console.warn(`Handler ${handler} for event ${event} not found.`);
            }

            if (eventContexts.length > 0)
                widgetEventMaps.push({ widgetID: widget.id, events: eventContexts });
        }

        return widgetEventMaps;
    }

    private extractMethods(file: ts.SourceFile): Map<string, ts.MethodDeclaration> {
        const methods = new Map<string, ts.MethodDeclaration>();

        for (const cls of file.getClasses()) {
            for (const method of cls.getMethods()) {
                const methodName = method.getName();
                methods.set(methodName, method);
            }
        }

        return methods;
    }

    private extractHandlerCalls(handler: ts.MethodDeclaration): EventHandlerCallContext[] {
        const calls: EventHandlerCallContext[] = [];

        // Look for CallExpressions in the method body
        const callExpressions = handler.getDescendantsOfKind(ts.SyntaxKind.CallExpression);

        for (const call of callExpressions) {
            const caller = call.getExpression().getText();
            const args = call.getArguments().map((arg) => arg.getText().replace(/[\[\]'`"]/g, ''));
            
            if (caller.includes('navigate')) {
                calls.push({
                    caller: caller, // e.g., this.router.navigate
                    called: args[0] || '', // The target route
                    data: [],
                });
            }
            else if (caller.includes('Service') || caller.includes('service')) {
                calls.push({
                    caller: caller, // e.g., this.userService.addUser
                    called: '/backend',
                    data: args, // Data passed to the call
                });
            }
        }

        return calls;
    }
}