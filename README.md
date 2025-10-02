# Static Analyzer for Automated Functional Testing of Frontend Web Applications
A core part of our **Automation Framework for Functional Testing**, this tool performs deep **static analysis** of Angular applications to build a comprehensive **navigation graph** and derive **user-journey scenarios**.

- **Routes** & redirects  
- **NgModules** & component declarations  
- **Components** & their nested child selectors  
- **Interactive widgets** (buttons, forms, inputs, anchors, Material controls)  
- **Event bindings** → handler call graphs (`router.navigate`, service calls, custom logic)  
- **Form validation rules** & **submission triggers**  
- **Scenarios** (module/route/component/widget/interaction → terminal outcomes)

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
6) **Scenario Extraction**  
   - Derives user-journey **scenarios** from the graph:
     - Route-scoped & global header paths  
     - One scenario per terminal outcome: `route` | `external-route` | `backend` | `virtual-route`  
     - **Fanout** options: keep siblings (primary) or **collapse** backend tails  
     - `intent` (human label) derived from route titles/paths; `success` computed from error sentinels  
   - Validates that scenario node IDs align with the graph.
7) **Express-based REST API**  
   - **POST** `/modules`           → all NgModule metadata (with lazy flags)  
   - **POST** `/components`        → all ComponentInfo (selectors, widgets, nested selectors)  
   - **POST** `/routes`            → routes, redirects, component roles  
   - **POST** `/template`          → single ComponentInfo by selector  
   - **POST** `/widgets`           → widget tree for one component  
   - **POST** `/widget-ids`        → flattened widget IDs for one component
   - **POST** `/business-logic`    → widget→event call graphs  
   - **POST** `/graph`             → full `AppNavigation` multigraph  
   - **POST** `/scenarios`         → user-journey scenarios
   - **GET**  `/healthz`           → health check

---

## 📁 Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
├── src/
│   ├── api/
│   │   ├── middleware.ts                # CORS, JSON body parser, error handler
│   │   ├── routes/
│   │   │   ├── business-logic.ts
│   │   │   ├── components.ts
│   │   │   ├── graph.ts
│   │   │   ├── modules.ts
│   │   │   ├── routes.ts
│   │   │   ├── scenarios.ts             
│   │   │   ├── template.ts
│   │   │   ├── widget-ids.ts            
│   │   │   └── widgets.ts
│   │   └── index.ts                     # Express app entry + /healthz
│   ├── analyzers/
│   │   ├── business-logic/
│   │   │   ├── logic-analyzer.ts
│   │   │   └── logic-utils.ts
│   │   ├── routes/
│   │   │   ├── route-analyzer.ts
│   │   │   └── route-utils.ts
│   │   └── template/
│   │       ├── template-analyzer.ts
│   │       ├── template-utils.ts
│   │       └── widgets/
│   │           ├── widget-id-generator.ts
│   │           ├── widget-processor.ts
│   │           └── widget-utils.ts       
│   ├── builders/
│   │   ├── component-registry-builder.ts
│   │   ├── module-registry-builder.ts
│   │   ├── navigation-graph-builder.ts
│   │   └── scenarios/                    
│   │       ├── graph-helpers.ts
│   │       ├── intent-labels.ts
│   │       ├── intent-resolver.ts
│   │       ├── scenario-artifact-validator.ts
│   │       ├── scenario-assembler.ts
│   │       ├── scenario-processors.ts
│   │       └── scenario-utils.ts
│   ├── orchestrators/
│   │   ├── static-analyzer.ts
│   │   └── scenario-extractor.ts         
│   ├── parsers/
│   │   ├── ast-utils.ts
│   │   └── template-parser.ts
│   ├── models/
│   │   ├── analyzer-config.ts            
│   │   ├── component-info.ts
│   │   ├── event-info.ts
│   │   ├── module-info.ts
│   │   ├── navigation-graph.ts
│   │   ├── route-info.ts
│   │   ├── scenarios/
│   │   │   ├── scenario-constants.ts     
│   │   │   └── scenario-info.ts          
│   │   └── widget-info.ts
│   └── logging/
│       └── logger.ts
├── .gitignore
├── nodemon.json
├── package.json
├── tsconfig.json
└── LICENSE
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

## 🖥️ Running the API Server
By default, the server listens on **port 3000** (override with `PORT`).

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

### POST `/scenarios`  ← **new**
Builds and returns user-journey scenarios from the navigation graph.

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
  "scenarios": [
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

---

## ⚙️ Configuration
Create a `.env` (or export env vars):

```bash
PORT=3000
```

**Advanced (code-level) analyzer config** – `src/models/analyzer-config.ts`:
* `backend.granularity`: `'single' | 'service' | 'method'` (default: `'method'`)
* `backend.serviceCallerRe`: regex to detect backend callers (default matches `*Service`, `http`, `httpClient`, `api`)
* `noise.methodNames` / `noise.freeFunctions`: filter Rx/plumbing/logging calls

> Note: advanced config is currently wired through constructors (not via the REST API).

---

## 📜 License
[MIT](LICENSE)

---