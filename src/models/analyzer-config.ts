export type BackendGranularity = 'single' | 'service' | 'method';

export interface AnalyzerConfig {
    backend: {
        granularity: BackendGranularity; // node shape in the graph
        serviceCallerRe: RegExp;         // which callers are “backend”
        normalizeServiceName: (s: string) => string;
    };
    noise: {
        methodNames: Set<string>;  // property calls to hide
        freeFunctions: Set<string>; // identifier calls to hide
    };
}

export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
    backend: {
        granularity: 'method',
        // *Service, this.http, this.httpClient, this.api
        serviceCallerRe: /\bthis\.(?:[A-Za-z]\w*Service|http|httpClient|api)(?=\.|$)/i,
        normalizeServiceName: s => s.replace(/^this\./, '').replace(/Service$/, '')
    },
    noise: {
        methodNames: new Set([
            // Rx / Promise plumbing
            'pipe', 'subscribe', 'toPromise', 'then', 'catch', 'finally',
            'map', 'switchMap', 'mergeMap', 'concatMap', 'exhaustMap',
            'tap', 'catchError', 'finalize', 'shareReplay', 'debounceTime',
            'throttleTime', 'delay', 'filter', 'take', 'takeUntil', 'first', 'last', 'scan',
            // console, misc
            'log',
            // DOM/UI-only helpers you don’t want in the nav graph
            'toLocaleDateString', 'readAsDataURL', 'reset',
            'get' // Optional: enable to hide generic .get(...) (non-backend)
        ]),
        freeFunctions: new Set(['of', 'from', 'timer', 'interval'])
    }
};