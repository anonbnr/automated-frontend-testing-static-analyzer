# Static Analyzer for Frontend Automation Framework
## Overview
The Static Analyzer is a key component of the **Frontend Automation Framework**, designed to perform **static code analysis** on Angular applications. It generates a **Navigation Graph**, which maps the structure of the application, including its routes, components, and interactive widgets. This Navigation Graph serves as the foundation for automated test scenario generation, enabling precise and efficient frontend testing.

## Features
- **Route Analysis**: Extracts routes from Angular's `RouterModule` configuration, including paths, associated components, and redirects.
- **Template Analysis**: Identifies interactive widgets (e.g., buttons, forms) and event bindings from Angular templates.
- **Logic Analysis**: Parses TypeScript files to extract navigation logic (e.g., calls to `router.navigate`).
- **Navigation Graph Builder**: Constructs a graph representation of the application's structure, including:
  - **Nodes**: Routes, components, widgets
  - **Transitions**: Navigation events, router links, redirects
- **Modular Design**: Highly modular and extensible structure for ease of maintenance and scalability.

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
│   ├── widget-info.ts            # Model for widget information
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
2. Send a POST request to the API:
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

## Key Components
### Analyzers
- **RouteAnalyzer**: Extracts route configurations, including paths, components, and redirects.
- **TemplateAnalyzer**: Parses Angular templates to identify widgets and their event bindings.
- **LogicAnalyzer**: Analyzes TypeScript files to extract navigation-related logic.

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
- Integration with dynamic analysis components.
- Enhanced error reporting and logging.
- Support for additional frontend frameworks (e.g., React, Vue).
- Automated test scenario generation based on the Navigation Graph.