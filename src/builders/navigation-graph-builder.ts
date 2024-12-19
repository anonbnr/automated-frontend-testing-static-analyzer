import { ComponentInfo } from "../models/component-info.js";
import { NavigationGraph, Node } from "../models/navigation-graph.js";
import { RouteMap, RouteMapUtils } from "../models/route-info.js";
import { WidgetEventMap, WidgetInfo } from "../models/widget-info.js";

export class NavigationGraphBuilder {
    private graph: NavigationGraph = { nodes: [], transitions: [] };

    getGraph(): NavigationGraph {
        return this.graph;
    }

    buildRoutes(routeMap: RouteMap): void {
        for (const { route } of routeMap.components) {
            this.addRoute(`/${route}`);
            console.log(`Route node added: /${route}`); // Debug log
        }

        for (const { route, redirectTo } of routeMap.redirections) {
            const source = this.getRoute(`/${route}`);
            const target = this.getRoute(`/${redirectTo}`);

            if (!source) // add the source route node if it's not already added
                this.graph.nodes.push({ id: `/${route}`, type: "route" });

            if (!target) // add the target route node if it's not already added
                this.graph.nodes.push({ id: `/${redirectTo}`, type: "route" });

            this.addRouteRedirect(`/${route}`, `/${redirectTo}`);
            console.log(`redirection transition added: /${route} -> /${redirectTo}`); // Debug log
        }
    }

    private addRoute(route: string): void {
        this.graph.nodes.push({ id: route, type: 'route' });
    }

    private addRouteRedirect(from: string, to: string): void {
        this.graph.transitions.push({
            from,
            to,
            "event": "redirect"
        });
    }

    buildComponentGraph(
        component: ComponentInfo,
        widgetEventMaps: WidgetEventMap[],
        route: string | undefined
    ): void {
        this.buildWidgets(component.widgets);
        this.buildContainsTransitions(route, component.widgets);
        this.buildRouterLinkTransitions(component.widgets);
        this.buildNavigationTransitions(widgetEventMaps);
    }

    private buildWidgets(widgets: WidgetInfo[]): void {
        for (const widget of widgets) {
            this.graph.nodes.push({ id: widget.id, type: widget.type });
            console.log(`Widget node added: ID: ${widget.id}, Type: ${widget.type}`);
        }
    }

    buildContainsTransitions(route: string | undefined, widgets: WidgetInfo[]): void {
        if (route) {
            for (const widget of widgets) {
                this.graph.transitions.push({ from: route, to: widget.id, event: "contains" });
                console.log(`contains transition added: ${route} -> ${widget.id}`);
            }
        }
    }

    buildSharedTransitions(component: ComponentInfo, parents: string[], routeMap: RouteMap): void {
        const sharedNodeId = `${component.selector}`;
        this.graph.nodes.push({ id: sharedNodeId, type: 'shared' });

        component.widgets.forEach((widget) => {
            this.graph.transitions.push({ from: sharedNodeId, to: widget.id, event: 'contains' });
        });

        parents.forEach((parent) => {
            const parentRoute = RouteMapUtils.getRouteFromSelector(parent, routeMap);
            if (parentRoute) {
                this.graph.transitions.push({ from: `/${parentRoute}`, to: sharedNodeId, event: 'contains' });
            }
        });
    }

    buildGlobalTransitions(component: ComponentInfo): void {
        const globalNodeId = `${component.selector}`;

        if (!this.graph.nodes.find((node) => node.id === globalNodeId)) {
            this.graph.nodes.push({ id: globalNodeId, type: 'global' });
            console.log(`Global node added: ${globalNodeId}`);
        }

        component.widgets.forEach((widget) => {
            this.graph.transitions.push({ from: globalNodeId, to: widget.id, event: 'contains' });
            console.log(`contains transition added: ${globalNodeId} -> ${widget.id}`);
        });
    }

    private buildRouterLinkTransitions(widgets: WidgetInfo[]): void {
        for (const widget of widgets) {
            const routerLink = widget.events.get("routerLink");
            if (routerLink) {
                const targetRoute = routerLink.startsWith('/') ? routerLink : `/${routerLink}`;
                const routeNode = this.getRoute(targetRoute);

                if (routeNode) {
                    this.graph.transitions.push({
                        from: widget.id,
                        to: targetRoute,
                        event: 'routerLink',
                    });
                    console.log(`routerLink transition added: ${widget.id} -> ${targetRoute}`);
                } else
                    console.warn(`Unmatched routerLink: ${routerLink} for widget ${widget.id}`);
            }
        }
    }

    private getRoute(routeId: string): Node | undefined {
        return this.graph.nodes.find(
            (node) => node.type === 'route' && node.id === routeId
        );
    }

    private buildNavigationTransitions(widgetEventMaps: WidgetEventMap[]): void {
        for (const widgetEventMap of widgetEventMaps) {
            for (const eventContext of widgetEventMap.events) {
                for (const { called } of eventContext.calls) {
                    if (called === "/backend" && !this.graph.nodes.find((n) => n.id === "/backend")) {
                        this.graph.nodes.push({ id: "/backend", type: "virtual-route" });
                        console.log('Virtual route node added: /backend');
                    }

                    this.graph.transitions.push({
                        from: widgetEventMap.widgetID,
                        to: called,
                        event: eventContext.event,
                    });

                    console.log(`${eventContext.event} transition added: ${widgetEventMap.widgetID} -> ${called}`);
                }
            }
        }
    }
}