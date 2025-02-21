/**
 * Represents information about a UI widget.
 */
export type WidgetInfo = {
    /**
     * Unique identifier for the widget.
     */
    id: string;

    /**
     * Type of the widget (e.g., "input", "button").
     */
    type: string;

    /**
     * A map of event-handler associations (e.g., "click" -> "onSavePost").
     */
    events: Map<string, string>;

    /**
     * Optional attributes associated with the widget (e.g., "placeholder", "value").
     */
    attributes?: {
        [key: string]: any; // Dynamically allows all properties
    };

    /**
     * Validation rules associated with this widget.
     * Example: ['required', 'pattern']
     */
    validationRules?: string[];

    /**
     * Indicates if this widget triggers form submission.
     */
    triggersFormSubmission?: boolean;
}
