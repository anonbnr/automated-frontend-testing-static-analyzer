# Static Analyzer for Automated Frontent Testing Framework
## Overview
The Static Analyzer is a core component of the **Frontend Automation Framework**, designed to perform **static code analysis** on Angular applications. It generates a **Navigation Graph** that maps the application's structure, including its routes, components, and interactive widgets. This graph serves as the foundation for automated test scenario generation, enabling precise and efficient frontend testing.

## Features
1. **Route Analysis**: Extracts Angular routing configurations, including paths, components, and redirects.
2. **Template Analysis**: Identifies interactive widgets (e.g., buttons, forms) and their event bindings from Angular templates.
3. **Logic Analysis**: Analyzes TypeScript files to extract navigation logic, such as calls to router.navigate and service interactions.
4. **Navigation Graph Builder**: Constructs a graph representation of the application's structure, including:
   - **Nodes**: Routes, components, widgets
   - **Transitions**: Navigation events, router links, redirects, and backend calls.
5. **Event Handling Models**:
   - **EventContext**: Captures details of events, including their handlers and associated calls.
   - **WidgetEventMap**: Maps widgets to events and transitions, providing deeper insights into event-driven navigation.
6. **Modular Design**: Highly modular and extensible structure for scalability and ease of maintenance.

## Project Structure
```plaintext
src/
├── analyzers/                 # Core static analysis logic
│   ├── logic-analyzer.ts          # Analyzes navigation logic in TypeScript files
│   ├── route-analyzer.ts          # Analyzes routing configurations
│   ├── template-analyzer.ts       # Analyzes Angular templates for widgets and bindings
├── api/                      # REST API for exposing the analyzer
│   ├── api.ts                    # Express API for analysis
├── builders/                 # Graph and other builders
│   ├── navigation-graph-builder.ts # Builds the navigation graph
├── models/                   # Data models and types
│   ├── navigation-graph.ts       # Models for graph nodes, transitions
│   ├── route-info.ts             # Models for route mappings and redirects
│   ├── widget-info.ts            # Models for widget information and event handling
├── orchestrators/            # High-level orchestrators
│   ├── static-analyzer.ts        # Combines analyzers to perform static analysis
├── parsers/                  # Parsing utilities
│   ├── angular-template-parser.ts # Parses Angular templates into AST
├── utils/                    # Utility classes and helpers
│   ├── widget-id-generator.ts    # Generates unique IDs for widgets
│   ├── widget-processor.ts       # Processes AST nodes into widgets
├── index.ts                  # Entry point for testing the analyzer locally
package.json                  # Project metadata and dependencies
tsconfig.json                 # TypeScript configuration
```

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/anonbnr/static-analyzer.git
   cd static-analyzer
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Usage
### Local Testing
You can test the static analyzer locally using the `index.ts` file:

1. Update the `tsConfigPath` and `outputFilePath` in `index.ts` to match your Angular project.
2. Run the script:
   ```bash
   npm run build && node dist/index.js
   ```

### API Endpoint
The static analyzer exposes an API for analyzing Angular applications.

1. Start the server:
   ```bash
   npm start
   ```
2. Send a POST request to the API using an API testing tool (e.g., [cURL](https://curl.se/), [Postman](https://www.postman.com/)):
   ```bash
   POST http://localhost:3000/analyze
   Content-Type: application/json

   {
     "projectRoot": "/path/to/angular/project"
   }
   ```

3. The response will include the generated Navigation Graph:
   ```json
   {
     "success": true,
     "navigationGraph": {
       "nodes": [...],
       "transitions": [...]
     }
   }
   ```

## Key Updates (Recent Enhancements)
### New Event Handling Models
- **EventHandlerCallContext**: Models calls within event handlers, capturing both `router.navigate` calls and backend service interactions.
- **EventContext**: Tracks event names, handlers, and associated calls for each widget.
- **WidgetEventMap**: Consolidates widget-specific event data into a unified structure for graph construction.

### Refactored Navigation Graph Construction
- Dynamically detects and adds **"backend" virtual routes** based on event handler calls.
- Refined **buildNavigationTransitions** to leverage event-driven transitions for comprehensive graph coverage.

### Improved Code Modularity
- Extracted route-related interfaces (`RouteMap`, `ComponentRoute`, `RedirectRoute`) into `models/route-info.ts`.
- Enhanced separation of concerns across analyzers, builders, and orchestrators.

## Core Components
### Analyzers
- **RouteAnalyzer**: Extracts route configurations, including paths, components, and redirects.
- **TemplateAnalyzer**: Parses Angular templates to identify widgets and their event bindings.
- **LogicAnalyzer**: Analyzes TypeScript files to extract navigation-related logic, including backend interactions.

### Graph Builder
- **NavigationGraphBuilder**: Constructs a directed graph representing the application's structure.

### Utilities
- **WidgetIDGenerator**: Generates unique IDs for widgets based on attributes and context.
- **WidgetProcessor**: Processes template AST nodes into widget representations.

### Orchestrator
- **StaticAnalyzer**: Combines analyzers and the graph builder to perform end-to-end static analysis.

## API Documentation
### **Endpoint**
- **URL**: `/analyze`
- **Method**: `POST`
- **Request Body**:
    - `projectRoot` (string): Absolute path to the root of the Angular project.
- **Response**:
    - `success` (boolean): Indicates whether the analysis was successful.
    - `navigationGraph` (object): Contains the nodes and transitions of the Navigation Graph.

## Future Enhancements
1. **Test Scenario Automation** (*High Priority*): Automatically generate test scenarios based on the Navigation Graph.
2. **Error Reporting**: Provide detailed error messages and recovery options.
3. **Dynamic Analysis Integration**: Combine static and dynamic analysis for comprehensive navigation graphs and automated frontend testing.
4. **Framework Support** (*Long-Term Goal*): Expand support to React, Vue, and other frontend frameworks.