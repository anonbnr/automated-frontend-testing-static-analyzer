// ──────────────────────────────────────────────────────────────────────────────
// models/analyzer-config.ts
//
// Purpose
//   Central configuration for the static analyzer. Controls how backend/service
//   calls are represented in the navigation graph and which low-signal calls
//   are filtered out as noise.
//
// Exposed
//   - BackendGranularity : shape of “backend” nodes in the graph
//   - AnalyzerConfig     : full configuration surface
//   - DEFAULT_ANALYZER_CONFIG : sane defaults for most Angular apps
//
// Notes
//   • Mutability: The exported default object is *not* frozen. Builders may
//     clone and tweak it per run/profile if needed.
//   • Regex semantics: `serviceCallerRe` is evaluated against a *stringified*
//     caller expression (e.g., "this.userService", "this.httpClient").
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Controls how backend/service interactions are represented in the graph.
 *
 * - 'single'  : Collapse every backend call to ONE canonical "backend" node.
 *               Useful for high-level views.
 * - 'service' : One node per service (e.g., `UserService`, `OrdersService`).
 * - 'method'  : One node per service *method* (e.g., `UserService.getById`).
 *               Most detailed (default).
 */
export type BackendGranularity = 'single' | 'service' | 'method';

/**
 * Analyzer configuration surface.
 */
export interface AnalyzerConfig {
    backend: {
        /**
        * Graph node granularity for backend/service calls.
        * See {@link BackendGranularity}.
        */
        granularity: BackendGranularity;

        /**
        * Regular expression identifying caller expressions that should be treated
        * as “backend/service” origins.
        *
        * Example matches (case-insensitive):
        *  - "this.userService"      ✅
        *  - "this.http" / "this.httpClient" / "this.api"  ✅
        *  - "this.feature"          ❌ (unless ends with 'Service')
        *
        * Tip: The analyzer should feed it the *caller* string portion before the
        * dot that leads to the invoked method (e.g., "this.userService").
        */
        serviceCallerRe: RegExp;

        /**
        * Normalizes a caller expression into a stable service identifier.
        *
        * Example:
        *   input:  "this.userService"  →  output: "user"
        *   input:  "this.httpClient"   →  output: "httpClient"
        */
        normalizeServiceName: (s: string) => string;
    };
    noise: {
        /**
        * Method names (property calls) to hide from call graphs.
        * Intended to filter plumbing/noise (RxJS, Promises, logging, DOM helpers).
        */
        methodNames: Set<string>;

        /**
        * Free function identifiers to hide from call graphs
        * (e.g., RxJS creation functions).
        */
        freeFunctions: Set<string>;
    };
}

/**
 * Default configuration tuned for Angular apps with RxJS.
 *
 * Backend detection:
 *  - Matches `this.*Service`, `this.http`, `this.httpClient`, `this.api`
 *  - Normalizes by removing leading "this." and trailing "Service"
 *
 * Noise filters:
 *  - Hides common RxJS operators and Promise methods
 *  - Hides logging and UI/DOM helpers
 *  - Includes a conservative 'get' entry (kept here; remove if overly broad)
 */
export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
    backend: {
        granularity: 'method',
        // Matches: this.<Something>Service | this.http | this.httpClient | this.api
        // - case-insensitive
        // - ensures the match ends before a dot or string end
        serviceCallerRe: /\bthis\.(?:[A-Za-z]\w*Service|http|httpClient|api)(?=\.|$)/i,

        // Examples:
        //  "this.userService"   → "user"
        //  "this.httpClient"    → "httpClient"
        //  "this.api"           → "api"
        normalizeServiceName: s => s.replace(/^this\./, '').replace(/Service$/, '')
    },
    noise: {
        methodNames: new Set([
            // RxJS / Promise plumbing
            'pipe', 'subscribe', 'toPromise', 'then', 'catch', 'finally',
            'map', 'switchMap', 'mergeMap', 'concatMap', 'exhaustMap',
            'tap', 'catchError', 'finalize', 'shareReplay', 'debounceTime',
            'throttleTime', 'delay', 'filter', 'take', 'takeUntil', 'first', 'last', 'scan',

            // Logging / misc
            'log',

            // DOM/UI-only helpers you don't want cluttering the nav graph
            'toLocaleDateString', 'readAsDataURL', 'reset',

            // Optional: hide generic `.get(...)` when it's non-backend
            'get'
        ]),

        // RxJS creation helpers
        freeFunctions: new Set(['of', 'from', 'timer', 'interval'])
    }
};