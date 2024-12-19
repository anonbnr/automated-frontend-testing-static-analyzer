# Static Analyzer for Automated Frontent Testing Framework
## Overview
The Static Analyzer is a core component of the **Frontend Automation Framework**, designed to perform **static code analysis** on Angular applications. It generates a **Navigation Graph** that maps the application's structure, including its routes, components, interactive widgets, and their validation rules. This graph serves as the foundation for automated test scenario generation, enabling precise and efficient frontend testing.

## Features
1. **Route Analysis**: Extracts Angular routing configurations, including paths, components, and redirects.
2. **Template Analysis**: Identifies interactive widgets (e.g., buttons, forms) and their event bindings, attributes, and validation rules from Angular templates.
3. **Logic Analysis**: Analyzes TypeScript files to extract navigation logic, such as calls to router.navigate and service interactions, and validation rules.
4. **Navigation Graph Builder**: Constructs a graph representation of the application's structure, including:
   - **Nodes**: Routes, components, widgets, and virtual routes.
   - **Transitions**: Navigation events, router links, redirects, backend calls, and form submissions
5. **Event Handling Models**:
   - **EventContext**: Captures details of events, including their handlers and associated calls.
   - **WidgetEventMap**: Maps widgets to events and transitions, providing deeper insights into event-driven navigation.
   - **Validation Rules**: Extracts and maps form control validation rules (e.g., `Validators.required`) to widgets.
6. **Modular Design**: Highly modular and extensible structure for scalability and ease of maintenance.

## Project Structure
```plaintext
automated-frontend-testing-static-analyzer/
├── src/
│   ├── analyzers/                 
│   │   ├── logic-analyzer.ts        # Analyzes navigation logic in TypeScript files
│   │   ├── route-analyzer.ts        # Analyzes routing configurations
│   │   ├── template-analyzer.ts     # Analyzes Angular templates for widgets and bindings
│   ├── api/                         
│   │   ├── api.ts                   # Express API for analysis
│   ├── builders/                    
│   │   ├── navigation-graph-builder.ts # Builds the navigation graph
│   ├── models/                      
│   │   ├── component-info.ts        # Component-level models
│   │   ├── navigation-graph.ts      # Models for graph nodes and transitions
│   │   ├── route-info.ts            # Models for route mappings and redirects
│   │   ├── widget-info.ts           # Models for widget details, events, and validation rules
│   ├── orchestrators/               
│   │   ├── static-analyzer.ts       # Combines analyzers for end-to-end analysis
│   ├── parsers/                     
│   │   ├── angular-template-parser.ts # Parses Angular templates into AST
│   ├── utils/                       
│   │   ├── route-info-utils.ts      # Helpers for route-related processing
│   │   ├── widget-id-generator.ts   # Generates unique IDs for widgets
│   │   ├── widget-processor.ts      # Processes AST nodes into widget models
│   ├── index.ts                     # Entry point for local testing
├── package.json                     
├── tsconfig.json                    
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
### Enhanced Widget Processing
- Extracts detailed widget attributes, events, and validation rules (e.g., `Validators.required`, `Validators.pattern`).
- Maps form control validation rules to corresponding widgets in the Navigation Graph.

### Navigation Graph Improvements
- Includes validation rules and widget attributes for better test scenario definition.
- Refined transition building for backend calls, form submissions, and router links.

### Modular Enhancements
- Updated data models (`widget-info.ts`, `navigation-graph.ts`) to include validation rules and form submission triggers.
- Refactored `LogicAnalyzer` and `WidgetProcessor` for improved validation and event handling logic.

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