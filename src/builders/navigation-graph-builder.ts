import { NavigationGraph } from "../models/navigation-graph.js";
import { WidgetInfo } from "../models/widget-info.js";

export class NavigationGraphBuilder {
    private graph: NavigationGraph;

    constructor() {
        this.graph = { nodes: [], transitions: [] };
    }

    async addRoute(route: string): Promise<void> {
        this.graph.nodes.push({ id: route, type: 'route' });
    }

    async addWidgets(
        widgets: WidgetInfo[],
        handlers: Map<string, string[]>,
        routeId: string | undefined
    ): Promise<void> {
        for (const widget of widgets){
            // Add widget node
            this.graph.nodes.push({ id: widget.id, type: widget.type });
            
            // Add "contains" transition from route to widget (if one exists)
            if (routeId)
                this.graph.transitions.push({ from: routeId, to: widget.id, event: 'contains', });
            
            // Add routerLink transitions
            const routerLink = widget.events.get('routerLink');
            if (routerLink) {
                if (routerLink.startsWith('http')){
                    this.graph.transitions.push({
                        from: widget.id,
                        to: routerLink,
                        event: 'externalLink',
                    });
                }
                else {
                    const targetRoute = routerLink.startsWith('/') ? routerLink : `/${routerLink}`;
                    const routeNode = this.graph.nodes.find(
                        (node) => node.type === 'route' && node.id === targetRoute
                    );

                    if (routeNode) {
                        this.graph.transitions.push({
                            from: widget.id,
                            to: targetRoute,
                            event: 'routerLink',
                        });
                    } else {
                        console.warn(`Unmatched routerLink: ${routerLink} for widget ${widget.id}`);
                    }
                }
            }

            // Add navigation transitions (if the widget's handlers have navigation logic)
            for (const [event, handler] of widget.events) {
                // console.log(`Matching handler: ${handler}`);
                if (event === "routerLink") continue; // Skip routerLink since already handled
                const associatedRoutes = handlers.get(handler);
                if (associatedRoutes) {
                    for (const targetRoute of associatedRoutes) {
                        // Ensure the target route exists in the graph
                        const normalizedTargetRoute = `${targetRoute.replace(/['"`]/g, '')}`;
                        const routeNode = this.graph.nodes.find(
                            (node) => node.type === 'route' && node.id === normalizedTargetRoute
                        );

                        if (routeNode) {
                            this.graph.transitions.push({
                                from: widget.id,
                                to: normalizedTargetRoute,
                                event: event,
                            });
                            console.log(`Navigate transition: ${widget.id} -> ${normalizedTargetRoute}`); // Debug log
                        } 
                        else
                            console.warn(`Unmatched route for handler ${handler}: ${normalizedTargetRoute}`); // Debug log
                    }
                }
                else
                    console.warn(`No routes found for handler: ${handler}`); // Debug log
            }
        }
    }

    async addRouteRedirect(from: string, to: string): Promise<void> {
        this.graph.transitions.push({
            from,
            to,
            "event": "redirect" 
        });
    }

    build(): NavigationGraph {
        return this.graph;
    }
}