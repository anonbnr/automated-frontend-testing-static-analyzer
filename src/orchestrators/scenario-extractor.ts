import { v4 as uuidv4 } from 'uuid';

// export interface ScenarioStep {
//     from: string;
//     via: Transition;
//     to: string;
// }

// export interface UserScenario {
//     id: string;
//     steps: ScenarioStep[];
// }

// export class ScenarioExtractor {
//     private adj: Map<string, Transition[]> = new Map();
//     private homeRoute: string;
//     private rawScenarios: ScenarioStep[][] = [];
//     private uniqueKeys = new Set<string>();

//     constructor(private graph: NavigationGraph) {
//         // build adjacency list
//         for (const t of graph.transitions) {
//             if (!this.adj.has(t.from)) {
//                 this.adj.set(t.from, []);
//             }
//             this.adj.get(t.from)!.push(t);
//         }

//         // find home route
//         const home = graph.nodes.find(n => n.id === '/' && n.type === 'route');
//         if (!home) {
//             throw new Error(`ScenarioExtractor: no home '/' route found`);
//         }
//         this.homeRoute = home.id;
//     }

//     /**
//      * Returns true for transitions that we consider "terminal" user scenarios.
//      */
//     private isTerminalTransition(t: Transition): boolean {
//         // form submissions always end a scenario
//         if (t.event === 'ngSubmit') return true;

//         // any click/right-away nav to your virtual '/backend' → end
//         if (t.to === '/backend' && t.event === 'click') return true;

//         // otherwise keep exploring through routes & contains
//         return false;
//     }


//     /**
//      * Public API: extract all unique user scenarios.
//      */
//     public extract(): UserScenario[] {
//         this.rawScenarios = [];
//         this.uniqueKeys.clear();

//         // begin a DFS from the home route
//         this.dfs(this.homeRoute, [], new Set([this.homeRoute]));

//         // build final de-duplicated scenarios
//         return this.rawScenarios
//             .map(steps => {
//                 const key = steps.map(s => `${s.from}->${s.via.event}->${s.to}`).join('|');
//                 if (this.uniqueKeys.has(key)) return null;
//                 this.uniqueKeys.add(key);
//                 return { id: uuidv4(), steps };
//             })
//             .filter((sc): sc is UserScenario => sc !== null);
//     }

//     /**
//      * Depth-first backtracking walk.
//      *
//      * @param current   the current node ID we’re standing on
//      * @param path      accumulated ScenarioStep sequence so far
//      * @param visited   set of node IDs to prevent cycles
//      */
//     private dfs(
//         current: string,
//         path: ScenarioStep[],
//         visited: Set<string>
//     ): void {
//         // for each outgoing transition...
//         for (const edge of this.adj.get(current) ?? []) {
//             // skip cycles
//             if (visited.has(edge.to)) continue;

//             // extend path
//             const step: ScenarioStep = { from: current, via: edge, to: edge.to };
//             path.push(step);

//             // if this transition ends a scenario, record it
//             if (this.isTerminalTransition(edge)) {
//                 this.rawScenarios.push([...path]);
//             } else {
//                 // otherwise, recurse deeper
//                 visited.add(edge.to);
//                 this.dfs(edge.to, path, visited);
//                 visited.delete(edge.to);
//             }

//             // backtrack
//             path.pop();
//         }
//     }
// }
