import { ComponentInfo } from "../models/component-info.js";
import { NavigationGraph, Node } from "../models/navigation-graph.js";
import { RouteMap } from "../models/route-info.js";
import { WidgetEventMap, WidgetInfo } from "../models/widget-info.js";
import { RouteMapUtils } from "../utils/route-info-utils.js";

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

    private addGlobal(globalId: string): void {
        this.graph.nodes.push({ id: globalId, type: 'global' });
    }

    private addShared(sharedId: string): void {
        this.graph.nodes.push({ id: sharedId, type: 'shared' });
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
            this.graph.nodes.push({
                id: widget.id,
                type: widget.type,
                attributes: widget.attributes,
                validationRules: widget.validationRules,
                triggersFormSubmission: widget.triggersFormSubmission
            });
            console.log(`Widget node added: ID: ${widget.id}, Type: ${widget.type}`);
        }
    }

    buildContainsTransitions(source: string | undefined, widgets: WidgetInfo[]): void {
        if (source) {
            for (const widget of widgets) {
                const transitionExists = this.graph.transitions.some(
                    (t) => t.from === source && t.to === widget.id && t.event === "contains"
                );

                if (!transitionExists) {
                    this.graph.transitions.push({ from: source, to: widget.id, event: "contains" });
                    console.log(`Contains transition added: ${source} -> ${widget.id}`);
                }
            }
        }
    }

    buildGlobalTransitions(component: ComponentInfo): void {
        const globalNodeId = `${component.selector}`;

        if (!this.graph.nodes.find((node) => node.id === globalNodeId)) {
            this.addGlobal(globalNodeId);
            console.log(`Global node added: ${globalNodeId}`);
        }

        this.buildContainsTransitions(globalNodeId, component.widgets);
    }

    buildSharedTransitions(component: ComponentInfo, routeMap: RouteMap, componentMap: ComponentInfo[]): void {
        const sharedNodeId = `${component.selector}`;

        // Add shared node to the graph
        if (!this.graph.nodes.find((node) => node.id === sharedNodeId)) {
            this.addShared(sharedNodeId);
            console.log(`Shared node added: ${sharedNodeId}`);
        }

        // Add contains transitions for shared node's widgets
        this.buildContainsTransitions(sharedNodeId, component.widgets);

        // Find parent routes and create transitions
        const parentRoutes = RouteMapUtils.findParentRoutes(component, componentMap, routeMap);
        parentRoutes.forEach(route => {
            this.graph.transitions.push({ from: route, to: sharedNodeId, event: "contains" });
            console.log(`Shared node transition added: ${route} -> ${sharedNodeId}`);
        });
    }

    private buildRouterLinkTransitions(widgets: WidgetInfo[]): void {
        for (const widget of widgets) {
            let routerLink = widget.events.get("routerLink") || widget.attributes?.["routerLink"];
            if (routerLink) {
                const targetRoute = routerLink.startsWith('/') ? routerLink : `/${routerLink}`;
                const routeNode = this.getRoute(targetRoute);

                if (!routeNode) {
                    console.warn(`Unmatched routerLink: ${routerLink} for widget ${widget.id}.`);
                    continue;
                }

                const transitionExists = this.graph.transitions.some(
                    (t) => t.from === widget.id && t.to === routeNode.id && t.event === 'routerLink'
                );

                if (!transitionExists) {
                    this.graph.transitions.push({
                        from: widget.id,
                        to: routeNode.id,
                        event: 'routerLink',
                    });

                    console.log(`routerLink transition added: ${widget.id} -> ${routeNode.id}`);
                }
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
                for (const { called, data } of eventContext.calls) {
                    if (called === "/backend" && !this.graph.nodes.find((n) => n.id === "/backend")) {
                        this.graph.nodes.push({ id: "/backend", type: "virtual-route" });
                        console.log('Virtual route node added: /backend');
                    }

                    // Check if the transition already exists before adding
                    const transitionExists = this.graph.transitions.some(
                        (t) => t.from === widgetEventMap.widgetID && t.to === called && t.event === eventContext.event
                    );

                    if (called && called.trim() !== "" && !transitionExists) {
                        this.graph.transitions.push({
                            from: widgetEventMap.widgetID,
                            to: called,
                            event: eventContext.event,
                            metadata: { data }
                        });

                        console.log(`Transition added: ${widgetEventMap.widgetID} -> ${called} [${eventContext.event}]`);
                    }
                }
            }
        }
    }
}