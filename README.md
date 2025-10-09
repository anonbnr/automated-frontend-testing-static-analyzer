# SoftScanner Backend — Automated Frontend Functional Web Testing Analyzer (Node/TypeScript)
The **SoftScanner Backend** is the analytical and service layer powering the [SoftScanner UI](https://github.com/anonbnr/automated-frontend-testing-ui).
It exposes REST APIs that assist in automating **functional testing of frontend web applications**.
It is written in **TypeScript** and runs on **Node.js**, combining static code analysis, dependency graph resolution, and browser automation.
Concretely, it statically analyzes frontend codebases (with focus on Angular projects) to:

1. Extract **modules, routes, components, widgets, templates, and logic graphs**
2. Produce a validator-annotated **navigation graph**
3. Derive **user journeys**
4. Capture **route screenshots**, and
5. Parse and infer **StageAction DSL** for interaction staging.

---

## 🚀 Features
### 🧩 Static Code Analysis
1) **Module Discovery**  
   - Scans all `@NgModule` classes and tags lazy modules.
   - Classifies modules as **root**, **routing**, **external**, **global**, or **shared**.
2) **Component & Template Analysis**  
   - Finds every `@Component`, loads its template (inline or external), and extracts:
     - Selector & class name  
     - Nested `<app-*>` child components  
     - Interactive widgets (forms, inputs, buttons, anchors, Material, etc.)  
     - **Stable widget IDs** (contextual, short 8-hex suffix; `/` sanitized)  
     - Widget attributes, event handlers, validation rules, submission flags  
     - **Effective widget type** (e.g., `<input type="email">` → `email`)  
3) **Route Analysis**  
   - Gathers routes from `Routes[]`, `RouterModule.forRoot/forChild`, `loadChildren`, and `loadComponent`.  
   - Normalizes & de-dupes paths; handles redirects; classifies component roles:
     - **root**, **global**, **shared**, **mapped**, **dead**
4) **Business-Logic Analysis**  
   - Uses **ts-morph** to inspect component ASTs.  
   - Maps each widget event (`click`, `submit`, `routerLink`, `href`, `navigate*`, custom) to:
     - Handler methods & call sites  
     - `router.navigate*` targets (arrays, UrlTree, or string paths)  
     - **Service/HTTP calls** (marked as backend interactions)  
   - Extracts form-control validators (`Validators.*`) and applies back to widgets.  
   - **Noise filtering** (Rx plumbing, logging, etc.) and configurable backend heuristics.

---

### 🕸 Navigation Graph Reconstruction
 - Builds a **multigraph** (`AppNavigation`) with:
   - **Static edges** (`contains`, `imports`, `declares`)  
   - **Dynamic transitions** (`click`, `routerLink`, `navigate*`, `href`, `lazy-load`, `static-redirect`, `service-call`)  
 - **Nodes**: `module`, `route`, `component`, `widget`, `backend`, `external-route`, `virtual-route`  
 - **Route node attributes**: `pathMatch`, `canActivate`, `canActivateChild`, `canLoad`, `resolve`, `data`  
 - **Widget node attributes**: `attributes`, `events`, `widgetType`, `validationRules`, `triggersFormSubmission`  
 - **Form submission modeling**: submit-trigger widget → `submit` → nearest ancestor `<form>`.  
 - **Canonicalization** of navigation targets to known routes when possible.

---

### 👣 User Journey Extraction
 - Derives **user journeys** from the graph:
   - Route-scoped & global header paths  
   - One journey per terminal outcome: `route` | `external-route` | `backend` | `virtual-route`  
   - **Fanout** options: keep siblings (primary) or **collapse** backend tails  
   - `intent` (human label) derived from route titles/paths; `success` computed from error sentinels  
 - Validation ensures journey step IDs align with the graph

---

### 📸 Screenshot Capture & Serving
 - Uses **Puppeteer** to render and capture SPA routes.
 - stored on disk under `data/screenshots` and retrievable via public GET URLs.
 - status surfaces `ready | capturing | waiting | missing`.
 - Supports API endpoints to check status, trigger capture, and serve PNG images.

---

### ⚙️ Environment-Driven Configuration
* `.env` file manages backend/port setup, screenshot directories, and base URLs.
* Uses a **typed env loader** (`api/env.ts`) to ensure robust startup validation.

---

## 📁 Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
├─ src/
│  ├─ api/                                 # Express HTTP layer
│  │  ├─ env.ts                            # Centralized .env loader + typed env helpers
│  │  ├─ index.ts                          # App bootstrap; registers routers; uses BACKEND_PORT
│  │  ├─ middleware.ts                     # CORS, JSON body, error handler
│  │  ├─ utils.ts                          # Path helpers (platform-root resolvers, tsconfig lookup)
│  │  └─ routes/                           # Each domain served by a dedicated route file
│  │     ├─ actions.ts                     # POST /actions endpoints (parse + infer)
│  │     ├─ business-logic.ts              # POST /business-logic
│  │     ├─ components.ts                  # POST /components
│  │     ├─ graph.ts                       # POST /graph
│  │     ├─ modules.ts                     # POST /modules
│  │     ├─ routes.ts                      # POST /routes
│  │     ├─ screenshots.ts                 # POST /screenshots: status, capture, GET/ screenshot image
│  │     ├─ template.ts                    # POST /template
│  │     ├─ user-journeys.ts               # POST /user-journeys
│  │     ├─ widget-ids.ts                  # POST /widget-ids
│  │     └─ widgets.ts                     # POST /widgets
│  ├─ analyzers/                           # Low-level static analyzers
│  │  ├─ business-logic/                   # Extracts event-handler graphs from AST
│  │  │  ├─ logic-analyzer.ts              # ts-morph walker for call graphs
│  │  │  └─ logic-utils.ts                 # AST helpers
│  │  ├─ routes/                           # Parses and validates Angular routing definitions
│  │  │  ├─ route-analyzer.ts              # Router config discovery
│  │  │  └─ route-utils.ts                 # Helpers for paths/redirects
│  │  └─ template/
│  │     ├─ template-analyzer.ts           # Template parsing + widget extraction
│  │     ├─ template-utils.ts              # Template helpers
│  │     └─ widgets/
│  │        ├─ widget-id-generator.ts      # Stable, short widget IDs
│  │        ├─ widget-processor.ts         # Node → WidgetInfo
│  │        └─ widget-utils.ts             # Misc widget helpers
│  ├─ builders/                            # Builders assembling higher-level artifacts
│  │  ├─ component-registry-builder.ts     # Catalog of components
│  │  ├─ module-registry-builder.ts        # Catalog of modules
│  │  ├─ navigation-graph-builder.ts       # AppNavigation multigraph
│  │  ├─ scenarios/                        # Scenario-level inference
│  │  │  └─ action-inferer.ts              # Core inference engine for StageActions
│  │  └─ user-journeys/
│  │     ├─ graph-helpers.ts               # Graph traversal helpers
│  │     ├─ intent-labels.ts               # Route → human-readable intent
│  │     ├─ intent-resolver.ts             # Intent derivation
│  │     ├─ user-journey-artifact-validator.ts # Journey integrity checks
│  │     ├─ user-journey-assembler.ts      # Build journeys from graph
│  │     ├─ user-journey-processors.ts     # Post-processing
│  │     └─ user-journey-registry-builder.ts# Registry + indexing
│  ├─ orchestrators/                       # High-level workflows
│  │  ├─ static-analyzer.ts                # End-to-end static project analysis orchestrator
│  │  └─ user-journey-extractor.ts         # Drives user journey discovery (Graph → journeys pipeline)
│  ├─ parsers/                             # Syntactic and semantic parsers
│  │  ├─ ast-utils.ts                      # TS/AST utilities
│  │  ├─ stage-action-dsl.ts               # DSL parser for scenario authoring
│  │  └─ template-parser.ts                # DOM/HTML parsing utilities
│  ├─ services/
│  │  └─ screenshot.service.ts             # Headless capture, on-disk status/markers
│  ├─ models/
│  │  ├─ analyzer-config.ts
│  │  ├─ component-info.ts
│  │  ├─ event-info.ts
│  │  ├─ module-info.ts
│  │  ├─ navigation-graph.ts
│  │  ├─ route-info.ts
│  │  ├─ screenshot-info.ts                # Types for screenshot status items
│  │  ├─ widget-info.ts
│  │  ├─ scenarios/
│  │  │  └─ stage-action.ts                # Type for action staging (StageActionKind, StageTarget, etc.)
│  │  └─ user-journeys/
│  │     ├─ user-journey-constants.ts
│  │     └─ user-journey-info.ts
│  └─ logging/
│     └─ logger.ts                         # Winston + rotate file logger
├─ data/                                   # Ignored runtime artifacts
│  └─ screenshots/                         # PNGs + marker files (sha1-bucketed)
├─ package.json
├─ tsconfig.json
├─ nodemon.json
├─ .env                                    # Optional env overrides (see below)
├─ .gitignore
└─ LICENSE
```

---

## 🛠 Installation & Build
```bash
git clone https://github.com/anonbnr/automated-frontend-testing-static-analyzer.git
cd automated-frontend-testing-static-analyzer

npm install
npm run build
```

### Development Mode

```bash
npm run dev
# watches `src/**/*.ts` and restarts on changes via nodemon
```

---

## ⚙️ Configuration & Environment
Create a `.env` in the backend root (same dir as `package.json`) or export env vars.

```ini
# Server
BACKEND_PORT=3000           # fallback to PORT, else 3000
BACKEND_API_BASE_URL=http://localhost:3000 # base URL for the backend server

# Screenshots storage
BACKEND_SCREENSHOTS_STORAGE_DIR=data/screenshots
# Screenshots base URL of the frontend-under-test; if omitted, derived from FRONTEND_PORT
BACKEND_SCREENSHOTS_BASE_URL=http://localhost:4200
# Used only to derive the above when BACKEND_SCREENSHOTS_BASE_URL is not set
FRONTEND_PORT=4200

# (Planned) backend LLM — off by default
LLM_ENABLED=false
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4.1
LLM_TIMEOUT_MS=30000
LLM_MAX_TOKENS=4000
LLM_RATE_LIMIT_PER_MIN=30
```

At startup, `src/api/env.ts` prints a one-line summary of resolved values.

**Data layout:** screenshots are stored under
`data/screenshots/<sha1(analysisId)>/<sha1(journeyId)>/<sha1(route)>.png`
Marker files `.pending` / `.capturing` live alongside the PNG to reflect state.

**Advanced (code-level) analyzer config** – `src/models/analyzer-config.ts`:
* `backend.granularity`: `'single' | 'service' | 'method'` (default: `'method'`)
* `backend.serviceCallerRe`: regex to detect backend callers (default matches `*Service`, `http`, `httpClient`, `api`)
* `noise.methodNames` / `noise.freeFunctions`: filter Rx/plumbing/logging calls

> Note: advanced config is currently wired through constructors (not via the REST API).

---

## 🖥️ Running the API Server
By default, the server listens on **port 3000** (override with `BACKEND_PORT` or `PORT`).

```bash
npm start
```

Health check:

```bash
curl http://localhost:3000/healthz
# -> { "ok": true }
```

---

## 🔌 REST API Reference
Each endpoint accepts and returns JSON unless stated otherwise.

| Method   | Endpoint                                        | Description                                                                       |
| :------- | :---------------------------------------------- | :-------------------------------------------------------------------------------- |
| **POST** | `/modules`                                      | Analyze the application’s modules and their roles.                                |
| **POST** | `/components`                                   | Analyze components: templates, inputs/outputs, selectors.                         |
| **POST** | `/routes`                                       | Extract routing configuration and metadata.                                       |
| **POST** | `/widgets`                                      | Extract and classify widgets from component templates.                            |
| **POST** | `/template`                                     | Template-level structural parsing.                                                |
| **POST** | `/business-logic`                               | Discover event-to-handler connections within components.                          |
| **POST** | `/graph`                                        | Generate a unified navigation graph across all layers.                            |
| **POST** | `/user-journeys`                                | Infer high-level user journeys from the navigation graph.                         |
| **POST** | `/screenshots/:analysisId/status`               | Return screenshot availability for all routes/journeys.                           |
| **POST** | `/screenshots/:analysisId/capture`              | Launch Puppeteer capture jobs; returns status envelope.                           |
| **GET**  | `/screenshots/:analysisId/:journeyId/:route(*)` | Serve existing screenshot PNG from disk.                                          |
| **POST** | `/actions/parse`                                | Parse a StageAction DSL string into structured actions and diagnostics. |
| **POST** | `/actions/infer`                                | Infer ordered StageActions from journey, graph, and widget IDs.         |

---

## 🔌 API Reference
All endpoints expect a JSON body including `"projectRoot": "/absolute/path/to/your/angular/project"` and, where required, `"selector": "app-your-component"`.

### POST `/modules`

```json
{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "modules": [ /* ModuleInfo[] (with lazy flags, routes assigned) */ ]
}
```

---

### POST `/components`

```json
{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "components": [ /* ComponentInfo[] */ ]
}
```

---

### POST `/routes`

```json
{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "routeMap": {
    "routes":        [ /* ComponentRoute[] */ ],
    "redirections":  [ /* RedirectRoute[] */ ],
    "roles": {
      "root":   ["app-root"],
      "global": [/* selectors */],
      "shared": [/* selectors */],
      "mapped": [/* selectors */],
      "dead":   [/* selectors */]
    }
  }
}
```

---

### POST `/template`

```json
{
  "projectRoot": "/path/to/angular/app",
  "selector":    "app-some-component"
}
```

**Response**

```json
{
  "success": true,
  "component": { /* ComponentInfo */ }
}
```

---

### POST `/widgets`

```json
{
  "projectRoot": "/path/to/angular/app",
  "selector":    "app-some-component"
}
```

**Response**

```json
{
  "success": true,
  "widgets": [ /* WidgetInfo tree (recursive) */ ]
}
```

---

### POST `/widget-ids`  ← **renamed**

```json
{
  "projectRoot": "/path/to/angular/app",
  "selector":    "app-some-component"
}
```

**Response**

```json
{
  "success": true,
  "widgetIDs": [ "app-some-component__BUTTON__save__a1b2c3d4", "..." ]
}
```

---

### POST `/business-logic`

```json
{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "widgetEventMaps": [ /* WidgetEventMap[] */ ]
}
```

---

### POST `/graph`

```json
{ "projectRoot": "/path/to/angular/app" }
```

**Response (shape)**

```json
{
  "success": true,
  "graph": {
    "nodes": [
      { "id": "/users", "type": "route", "attributes": {
        "pathMatch": "full",
        "canActivate": [/* ... */],
        "canActivateChild": [/* ... */],
        "canLoad": [/* ... */],
        "resolve": { /* ... */ },
        "data": { /* route data incl. title if any */ }
      }},
      { "id": "app-profile__BUTTON__save__deadbeef", "type": "widget", "attributes": {
        "widgetType": "button",
        "events": { "click": "onSave" },
        /* original attributes... */
      }, "validationRules": [/*...*/], "triggersFormSubmission": false },
      { "id": "/backend/user/save", "type": "backend" },
      { "id": "https://example.com", "type": "external-route" },
      { "id": "/ui/app-profile__.../toggle", "type": "virtual-route",
        "attributes": { "kind": "ui-effect", "handler": "toggle", "uiEffects": ["toggle"] } }
    ],
    "edges": [
      { "type": "contains", "from": "/users", "to": "app-profile" },
      /* ... */
    ],
    "transitions": [
      { "type": "click", "from": "app-profile__BUTTON__save__deadbeef", "to": "/users" },
      { "type": "service-call", "from": "app-profile__BUTTON__save__deadbeef", "to": "/backend/user/save",
        "metadata": { "service": "user", "method": "save", "sourceEvent": "click", "handler": "onSave" } },
      { "type": "submit", "from": "app-profile__BUTTON__submit__beadfeed", "to": "app-profile__FORM__main__c0ffee" }
    ]
  }
}
```

---

### POST `/user-journeys`
Builds and returns user journeys from the navigation graph.

**Request**

```json
{
  "projectRoot": "/path/to/angular/app",
  "fanoutMode": "primary",   // optional: "primary" | "collapse"
  "maxDepth": 0              // optional (reserved)
}
```

**Response (shape)**

```json
{
  "success": true,
  "journeys": [
    {
      "id": "AppModule→/users[routerLink]→/users/:id",
      "rootModule": "AppModule",
      "steps": [
        { "stepType": "module", "nodeId": "AppModule" },
        { "stepType": "route",  "nodeId": "/users" },
        { "stepType": "widget", "nodeId": "app-users__A__details__cafebabe", "metadata": { /* attrs/rules */ } },
        { "stepType": "interaction", "nodeId": "app-users__A__details__cafebabe", "via": "routerLink" },
        { "stepType": "route", "nodeId": "/users/:id" }
      ],
      "intent": "User Profile",
      "success": true
    }
  ]
}
```

### POST `/actions/parse`
**Input**

```json
{
  "script": "NAVIGATE /login\nINPUT email user@example.com\nSUBMIT"
}
```

**Output**

```json
{
  "success": true,
  "actions": [
    { "order": 0, "kind": "navigate", "target": { "type": "route", "id": "/login" } },
    { "order": 1, "kind": "input", "target": { "type": "widget", "id": "email" }, "value": "user@example.com" },
    { "order": 2, "kind": "submit", "target": { "type": "widget", "id": "form:login" } }
  ],
  "diagnostics": []
}
```

**Notes**
* Supports tokens: `NAVIGATE`, `CLICK`, `SUBMIT`, `INPUT`, `CHANGE`, `CHECK`, `UNCHECK`, `NOOP`.
* Diagnostics array includes `{ line, column, message, severity }`.
* Parsing is tolerant—invalid lines don’t abort parsing.

---

### POST `/actions/infer`
**Input**

```json
{
  "journey": { "id": "J-42", "steps": [ ... ] },
  "graph": { ... },
  "widgetIds": ["email", "password", "submit"]
}
```

**Output**

```json
{
  "success": true,
  "actions": [
    { "order": 0, "kind": "navigate", "target": { "type": "route", "id": "/login" } },
    { "order": 1, "kind": "input", "target": { "type": "widget", "id": "email" }, "value": "" },
    { "order": 2, "kind": "input", "target": { "type": "widget", "id": "password" }, "value": "" },
    { "order": 3, "kind": "submit", "target": { "type": "widget", "id": "form:login" } }
  ]
}
```

**Notes**
* Deterministic: same journey/graph always yields identical output.
* Eliminates redundant navigations, form duplicates, and redirect sequences.
* Provides a foundation for **Scenario Authoring** in the frontend.

---

### Screenshots API
For **screenshots**, pass an `analysisId`, `journeyId`, and `routes[]`.

> The service **does not** start your app.
> Ensure the SPA is reachable at `BACKEND_SCREENSHOTS_BASE_URL` (or pass `baseUrl`).

#### POST `/screenshots/:analysisId/status`

Body:

```json
{
  "journeyId": "AppModule→/new-post/…",
  "routes": ["/new-post", "/posts"]
}
```

Response:

```json
{
  "success": true,
  "storageRoot": "…/data/screenshots",
  "items": {
    "/new-post": { "route": "/new-post", "id": "<sha1>", "status": "ready",    "filename": "/abs/…png", "url": "/screenshots/<aid>/<jid>/new-post" },
    "/posts":    { "route": "/posts",    "id": "<sha1>", "status": "capturing","filename": "/abs/…png", "url": "/screenshots/<aid>/<jid>/posts" }
  }
}
```

#### POST `/screenshots/:analysisId/capture`

Body:

```json
{
  "journeyId": "AppModule→/new-post/…",
  "routes": ["/new-post", "/posts"],
  "baseUrl": "http://localhost:4200"   // optional override
}
```

* `200` with same `items` shape as **status** (states updated to `ready` as they complete)
* `503` if the frontend is not reachable (includes a helpful `hint`)

#### GET `/screenshots/:analysisId/:journeyId/:route(*)`
Serves the PNG for a logical SPA route. The `route` segment is the *logical path* (no leading slash in the URL; internally normalized).

---

## 🧩 Dependencies
* **TypeScript** — for strong typing and AST manipulation.
* **Express** — REST API framework.
* **Puppeteer** — for headless browser rendering and screenshot capture.
* **Node-Fetch** — for HTTP requests in utility modules.
* **Dotenv** — environment configuration.
* **UUID** — unique identifiers for analysis and screenshots.
* **File system & path utilities** — custom wrappers under `api/utils.ts`.
---

## 🔐 Notes & Limits
* Puppeteer runs in headless mode with animations/transitions disabled for stable visuals.
* Designed for single instance. If you scale, guard `capture()` with your own queue/lock.
* The `data/` directory is **git-ignored**.

---

## 🧪 Roadmap
- Backend LLM endpoints (journey refine, staging suggest, oracle/script gen).
- Scenarios/Workflows storage & export (runnable Playwright/Puppeteer/Selenium).
- Export caching and error envelopes with hint.

---

## 📜 License
[MIT](LICENSE)

---