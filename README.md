# Static Analyzer for Automated Functional Testing of Frontend Web Applications
A core part of our **Automation Framework for Functional Testing**, this tool performs deep **static analysis** of Angular applications to build a comprehensive **navigation graph**, derive **user journeys**, capture **screenshots** of the journeys' SPA routes for scenario previews using [Puppeteer](https://pptr.dev/).

- **Routes** & redirects  
- **NgModules** & component declarations  
- **Components** & their nested child selectors  
- **Interactive widgets** (buttons, forms, inputs, anchors, Material controls)  
- **Event bindings** → handler call graphs (`router.navigate`, service calls, custom logic)  
- **Form validation rules** & **submission triggers**  
- **User Journeys** (module/route/component/widget/interaction → terminal outcomes)
- **Screenshots** (headless capture per route; ready/waiting/capturing/missing states)

---

## 🚀 Features
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
5) **Navigation Graph Builder**  
   - Builds a **multigraph** (`AppNavigation`) with:
     - **Static edges** (`contains`, `imports`, `declares`)  
     - **Dynamic transitions** (`click`, `routerLink`, `navigate*`, `href`, `lazy-load`, `static-redirect`, `service-call`)  
   - **Nodes**: `module`, `route`, `component`, `widget`, `backend`, `external-route`, `virtual-route`  
   - **Route node attributes**: `pathMatch`, `canActivate`, `canActivateChild`, `canLoad`, `resolve`, `data`  
   - **Widget node attributes**: `attributes`, `events`, `widgetType`, `validationRules`, `triggersFormSubmission`  
   - **Form submission modeling**: submit-trigger widget → `submit` → nearest ancestor `<form>`.  
   - **Canonicalization** of navigation targets to known routes when possible.
6) **User Journey Extraction**  
   - Derives **user journeys** from the graph:
     - Route-scoped & global header paths  
     - One journey per terminal outcome: `route` | `external-route` | `backend` | `virtual-route`  
     - **Fanout** options: keep siblings (primary) or **collapse** backend tails  
     - `intent` (human label) derived from route titles/paths; `success` computed from error sentinels  
   - Validation ensures journey step IDs align with the graph
7) **Screenshots Capture**
   - headless **Puppeteer** captures per route
   - stored on disk and retrievable via public GET URLs.
   - status surfaces `ready | capturing | waiting | missing`.
8) **Express-based REST API**  
   - **GET**  `/healthz`           → health check
   - **POST** `/modules`           → all NgModule metadata (with lazy flags)  
   - **POST** `/components`        → all ComponentInfo (selectors, widgets, nested selectors)  
   - **POST** `/routes`            → routes, redirects, component roles  
   - **POST** `/template`          → single ComponentInfo by selector  
   - **POST** `/widgets`           → widget tree for one component  
   - **POST** `/widget-ids`        → flattened widget IDs for one component
   - **POST** `/business-logic`    → widget→event call graphs  
   - **POST** `/graph`             → full `AppNavigation` multigraph  
   - **POST** `/user-journeys`     → user journeys
   - **POST** `/screenshots/:analysisId/capture`                 → captures route(s) screenshot(s) for a journey in a given analysis
   - **POST** `/screenshots/:analysisId/status`                  → status of route(s) screenshot(s) for a journey in a given analysis
   - **GET** `/screenshots/:analysisId/:journeyId/:route(*)`     → retrieves route(s) screenshot(s) for a journey in a given analysis

---

## 📁 Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
automated-frontend-testing-static-analyzer/
├─ src/
│  ├─ api/                                 # Express HTTP layer
│  │  ├─ env.ts                            # Centralized .env loader + typed env helpers
│  │  ├─ index.ts                          # App bootstrap; registers routers; uses BACKEND_PORT
│  │  ├─ middleware.ts                     # CORS, JSON body, error handler
│  │  ├─ utils.ts                          # Path helpers (platform-root resolvers, tsconfig lookup)
│  │  └─ routes/
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
│  ├─ analyzers/                           # Code that inspects source & templates
│  │  ├─ business-logic/
│  │  │  ├─ logic-analyzer.ts              # ts-morph walker for call graphs
│  │  │  └─ logic-utils.ts                 # AST helpers
│  │  ├─ routes/
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
│  │  └─ user-journeys/
│  │     ├─ graph-helpers.ts               # Graph traversal helpers
│  │     ├─ intent-labels.ts               # Route → human-readable intent
│  │     ├─ intent-resolver.ts             # Intent derivation
│  │     ├─ user-journey-artifact-validator.ts # Journey integrity checks
│  │     ├─ user-journey-assembler.ts      # Build journeys from graph
│  │     ├─ user-journey-processors.ts     # Post-processing
│  │     └─ user-journey-registry-builder.ts# Registry + indexing
│  ├─ orchestrators/                       # High-level workflows
│  │  ├─ static-analyzer.ts                # End-to-end static analysis orchestrator
│  │  └─ user-journey-extractor.ts         # Graph → journeys pipeline
│  ├─ parsers/
│  │  ├─ ast-utils.ts                      # TS/AST utilities
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

# Screenshots storage
BACKEND_SCREENSHOTS_STORAGE_DIR=data/screenshots
# Screenshots base URL of the frontend-under-test; if omitted, derived from FRONTEND_PORT
BACKEND_SCREENSHOTS_BASE_URL=http://localhost:4200
# Used only to derive the above when BACKEND_SCREENSHOTS_BASE_URL is not set
FRONTEND_PORT=4200
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

### Screenshots API
For **screenshots**, pass an `analysisId`, `journeyId`, and `routes[]`.



> The service **does not** start your app. Ensure the SPA is reachable at `BACKEND_SCREENSHOTS_BASE_URL` (or pass `baseUrl`).

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

## 🔐 Notes & Limits
* Puppeteer runs in headless mode with animations/transitions disabled for stable visuals.
* Designed for single instance. If you scale, guard `capture()` with your own queue/lock.
* The `data/` directory is **git-ignored**.

---

## 📜 License
[MIT](LICENSE)

---