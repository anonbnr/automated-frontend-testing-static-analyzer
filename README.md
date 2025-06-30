# Automated Frontend Testing Static Analyzer
A core part of our **Frontend Automation Framework**, this tool performs deep **static analysis** of Angular applications to build a comprehensive **navigation graph**. The graph models:

- **Routes** & **redirects**  
- **NgModules** & component declarations  
- **Components** & their nested child selectors  
- **Interactive widgets** (buttons, forms, links, Material controls)  
- **Event bindings** → handler call graphs (`router.navigate`, service calls, custom logic)  
- **Form validation rules** & **submission triggers**  

This graph can drive automated test‐scenario generation, regression testing, coverage analysis, and more.

---

## 🚀 Features
1. **Module Discovery**  
   - Scans all `@NgModule` classes in your workspace  
   - Classifies each module as **root**, **routing**, **external**, **global**, or **shared**  
2. **Component & Template Analysis**  
   - Finds every `@Component`, loads its inline or external template  
   - Parses the template AST to extract:
     - Component selector & class name  
     - Nested `<app-*>` child components  
     - Interactive widgets (forms, inputs, buttons, anchors, Material, etc.)  
     - Stable, descriptive widget IDs  
     - Widget attributes, event handlers, validation rules, submission flags  
3. **Route Analysis**  
   - Gathers all Angular routes via `Routes[]` and `RouterModule.forRoot/forChild`  
   - Supports eager components, lazy modules (`loadChildren`), standalone components (`loadComponent`)  
   - Normalizes & de-dupes paths, handles redirects  
   - Classifies component usage roles:  
     - **root** (`<app-root>`)  
     - **global** (present on *every* route)  
     - **shared** (on multiple but not all routes)  
     - **mapped** (tied to exactly one route)  
     - **dead** (never used)  
4. **Business-Logic Analysis**  
   - Uses **ts-morph** to inspect each component’s TypeScript AST  
   - Maps each widget event (`click`, `submit`, `[routerLink]`, `href`, custom) to:
     - Event handler methods  
     - `router.navigate([...])` calls (route segments)  
     - Service calls (`this.myService.*`) marked as backend interactions  
     - Inline fragment navigations  
   - Extracts form-control validators (`Validators.*`) and applies them back to widgets  
5. **Navigation Graph Builder**  
   - Builds a **multigraph** (`AppNavigation`) with:
     - **Static edges** (`contains`, `imports`, `declares`) for modules→routes→components→widgets  
     - **Dynamic transitions** (`click`, `routerLink`, `navigate`, `lazy-load`, `static-redirect`)  
   - Exports the graph as JSON for downstream tools  
6. **Express-based REST API**  
   - **POST** `/modules`           → all NgModule metadata  
   - **POST** `/components`        → all ComponentInfo (selectors, widgets, nested selectors)  
   - **POST** `/routes`            → routes, redirects, component roles  
   - **POST** `/template`          → single ComponentInfo by selector  
   - **POST** `/widgets`           → widget tree for one component  
   - **POST** `/widget-id`         → flattened widget IDs for one component  
   - **POST** `/business-logic`    → widget→event call graphs  
   - **POST** `/graph`             → full `AppNavigation` multigraph  

---

## 📁 Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
├── src/
│   ├── api/
│   │   ├── middleware.ts           # CORS, JSON body parser, error handler
│   │   ├── routes/
│   │   │   ├── modules.ts
│   │   │   ├── components.ts
│   │   │   ├── routes.ts
│   │   │   ├── template.ts
│   │   │   ├── widgets.ts
│   │   │   ├── widget-id.ts
│   │   │   ├── business-logic.ts
│   │   │   └── graph.ts
│   │   └── index.ts               # Express app entry point
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
│   │           └── widget-processor.ts
│   ├── builders/
│   │   ├── component-registry-builder.ts
│   │   ├── module-registry-builder.ts
│   │   └── navigation-graph-builder.ts
│   ├── orchestrators/
│   │   └── static-analyzer.ts       # five-phase pipeline
│   ├── parsers/
│   │   ├── ast-utils.ts
│   │   └── template-parser.ts
│   └── models/
│       ├── component-info.ts
│       ├── event-info.ts
│       ├── module-info.ts
│       ├── navigation-graph.ts
│       ├── route-info.ts
│       └── widget-info.ts
├── .gitignore
├── nodemon.json                    # `npm run dev` configuration
├── package.json
├── tsconfig.json
└── LICENSE
```

---

## 🛠 Installation & Build
```bash
# Clone
git clone https://github.com/anonbnr/automated-frontend-testing-static-analyzer.git
cd automated-frontend-testing-static-analyzer

# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build
```

### Development Mode

```bash
npm run dev
# → watches `src/**/*.ts` and restarts on changes via nodemon
```

---

## 🖥️ Running the API Server
By default, the server listens on port **3000** (override with `PORT` in your environment).

```bash
npm start
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
  "modules": [ /* ModuleInfo[] */ ]
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
      "root":    ["app-root"],
      "global":  [/* selectors */],
      "shared":  [/* selectors */],
      "mapped":  [/* selectors */],
      "dead":    [/* selectors */]
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
  "widgets": [ /* WidgetInfo tree, recursive */ ]
}
```

---

### POST `/widget-id`
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
  "widgetIDs": [ "app-some-component__BUTTON__save__a1b2c3d4", ... ]
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

**Response**

```json
{
  "success": true,
  "graph": {
    "nodes":       [ /* GraphNode[] */ ],
    "edges":       [ /* GraphEdge[] */ ],
    "transitions": [ /* GraphTransition[] */ ]
  }
}
```

---

## ⚙️ Configuration
Create a `.env` in project root or export environment variables:

```bash
# API server port
PORT=3000
```

---

## 📜 License
[MIT](LICENSE)