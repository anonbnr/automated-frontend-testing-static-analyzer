# Automated Frontend Testing Static Analyzer
A core component of our **Frontend Automation Framework**, the Static Analyzer performs deep **static analysis** of Angular applications to produce a comprehensive **Navigation Graph**. That graph captures:

- **Routes** and **redirects**  
- **Components** and their hierarchical nesting  
- **Interactive widgets** (buttons, forms, links, etc.)  
- **Event bindings**, **router navigations**, **service calls**  
- **Form validation rules** and **submission triggers**  

This powers automated test-scenario generation and frontend regression testing.

---

## ⚙️ Features
1. **Component Discovery**  
   - Scans your entire codebase for `@Component` classes  
   - Loads inline templates or external `templateUrl` files  
   - Extracts component selectors, class names, nested child selectors  
2. **Template Analysis**  
   - Parses Angular templates into an AST  
   - Identifies every interactive widget (forms, buttons, inputs, anchors, Material controls, etc.)  
   - Generates stable, meaningful widget IDs  
   - Captures widget attributes, validation rules, submission triggers  
3. **Route Analysis**  
   - Gathers all Angular routes (`Routes` arrays, `RouterModule.forRoot` / `forChild`)  
   - Handles eager and lazy loading (`component`, `loadChildren`, `loadComponent`)  
   - Dedupe, normalize paths (leading `/`) and classify component roles:  
     - **root** (`<app-root>`)  
     - **global** (appears on *every* route)  
     - **shared** (on multiple routes)  
     - **mapped** (tied to exactly one route)  
     - **dead** (never used)  
4. **Logic Analysis**  
   - Inspects each component’s TypeScript AST via `ts-morph`  
   - Wires every widget event (`click`, `submit`, custom, `[routerLink]`, `href`) to its handler  
   - Extracts ordered call graphs: `router.navigate`, service calls, backend interactions  
   - Resolves dynamic route parameters against your `RouteMap`  
   - Pulls form control validators (`Validators.required`, `Validators.minLength`, etc.)  
5. **Navigation Graph Builder**  
   - Builds a **multigraph** of:  
     - **Nodes**: routes, components, widgets, virtual-routes  
     - **Static “contains” edges**: route→component→nestedComponent/widget  
     - **Dynamic transitions**: widget events → route or virtual target  
   - Exposes the resulting `AppNavigation` for downstream tools  
6. **Express API**  
   - **`POST /components`** → returns all `ComponentInfo`  
   - **`POST /routes`** → returns deduped `RouteMap` + component roles  
   - **`POST /graph`** → returns full `AppNavigation` multigraph  

---

## 📁 Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
├── src/
│   ├── api/
│   │   └── api.ts                        # Express endpoints: /components, /routes, /graph
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
│   │   └── navigation-graph-builder.ts
│   ├── models/
│   │   ├── component-info.ts
│   │   ├── event-info.ts
│   │   ├── navigation-graph.ts
│   │   ├── route-info.ts
│   │   └── widget-info.ts
│   ├── orchestrators/
│   │   └── static-analyzer.ts
│   ├── parsers/
│   │   └── template-parser.ts
│   └── index.ts                         # (optional CLI entry, if you choose to add it)
├── .gitignore
├── LICENSE
├── package.json                         
├── package-lock.json                    
└── tsconfig.json
```

---

## 🚀 Installation & Build
```bash
# 1. Clone
git clone https://github.com/anonbnr/automated-frontend-testing-static-analyzer
cd automated-frontend-testing-static-analyzer

# 2. Install
npm install

# 3. Build
npm run build
```

---

## 🖥️ Running the API Server
Starts on port **3000** by default (configurable via `PORT` env).

```bash
npm start
```

## 🔌 API Usage
All endpoints expect a JSON body:

```json
{ "projectRoot": "/absolute/path/to/your/angular/project" }
```

### 1. Discover Components
```http
POST http://localhost:3000/components
Content-Type: application/json

{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "components": [ /* ComponentInfo[] */ ]
}
```

### 2. Analyze Routes
```http
POST http://localhost:3000/routes
Content-Type: application/json

{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "routeMap": {
    "routes": [ /* ComponentRoute[] */ ],
    "redirections": [ /* RedirectRoute[] */ ],
    "roles": {
      "root": ["app-root"],
      "global": [/* selectors */],
      "shared": [/* selectors */],
      "mapped": [/* selectors */],
      "dead":   [/* selectors */]
    }
  }
}
```

### 3. Build Navigation Graph
```http
POST http://localhost:3000/graph
Content-Type: application/json

{ "projectRoot": "/path/to/angular/app" }
```

**Response**

```json
{
  "success": true,
  "graph": {
    "nodes":   [ /* GraphNode[] */ ],
    "edges":   [ /* GraphEdge[] */ ],
    "transitions": [ /* GraphTransition[] */ ]
  }
}
```

---

## ⚒️ Configuration
You can override defaults via environment variables:

```dotenv
# .env
PORT=3000
```

---

## 🔮 Roadmap
1. **Scenario Extraction** — integrate `ScenarioExtractor` (seasonal).
2. **Automated Test Generation** — from the Navigation Graph.
3. **Error Resilience** — richer diagnostics & partial-fail recovery.
4. **Multi-framework Support** — React, Vue, etc.

---

## 📄 License
[MIT](LICENSE)