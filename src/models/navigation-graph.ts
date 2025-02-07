/**
 * Represents a node in the navigation graph.
 * Nodes can be routes, widgets, or other UI elements.
 */
export interface Node {
    /**
     * Unique identifier of the node.
     */
    id: string;

    /**
     * Type of the node (e.g., "route", "widget").
     */
    type: string;

    /**
     * Optional attributes associated with the node.
     * These could be HTML attributes like type, class, etc.
     */
    attributes?: Record<string, any>;

    /**
     * Validation rules for form-related widgets.
     * Example: ['required', 'pattern']
     */
    validationRules?: string[];

    /**
     * Indicates whether this node (widget) triggers form submission.
     */
    triggersFormSubmission?: boolean;
}

/**
 * Represents a transition between two nodes in the navigation graph.
 */
export interface Transition {
    /**
     * ID of the source node.
     */
    from: string;

    /**
     * ID of the destination node.
     */
    to: string;

    /**
     * Event that triggers this transition (e.g., "click", "submit").
     */
    event: string;

    /**
     * Optional metadata for additional transition information.
     */
    metadata?: Record<string, any>;
}

/**
 * Represents the full navigation graph of the application.
 */
export interface NavigationGraph {
    /**
     * A list of all nodes in the navigation graph.
     */
    nodes: Node[];

    /**
     * A list of all transitions between nodes.
     */
    transitions: Transition[];
}