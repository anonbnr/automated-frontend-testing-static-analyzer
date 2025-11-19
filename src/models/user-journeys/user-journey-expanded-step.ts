// ──────────────────────────────────────────────────────────────────────────────
// models/user-journeys/user-journey-expanded-step.ts
// ──────────────────────────────────────────────────────────────────────────────

export type ActionType =
    | 'navigate'
    | 'click'
    | 'submit'
    | 'input'
    | 'change'
    | 'check'
    | 'uncheck'
    | 'noop'
    | 'select'
    | 'upload'
    | 'waitFor'

export type StageTargetType =
    | 'route'
    | 'external'
    | 'widget'
    | 'backend'
    | 'virtual';

export interface StageTarget {
    /** Semantic target category. */
    type: StageTargetType;
    /**
     * Identifier:
     * - route: "/users/:id" (normalized leading slash)
     * - external: "https://..."
     * - widget: WidgetInfo.id
     * - backend: "/backend/Service.method" or "/virtual/backend"
     * - virtual: "/ui/<label>"
     */
    id: string;
    /** Optional human label for UI (not used by engines). */
    display?: string;
}

export interface UserJourneyExpandedStep {
    
    actionType: ActionType;
    target: StageTarget;
    widgetId?: string;
    validationRules?: string[];
    triggersFormSubmission?: boolean;
    sensitiveData?: boolean;
    meta?: Record<string, any>;
}


// export type StageActionKind =
//     | 'navigate'
//     | 'click'
//     | 'submit'
//     | 'input'
//     | 'change'
//     | 'check'
//     | 'uncheck'
//     | 'noop';

// export type StageTargetType =
//     | 'route'
//     | 'external'
//     | 'widget'
//     | 'backend'
//     | 'virtual';

// export interface StageTarget {
//     /** Semantic target category. */
//     type: StageTargetType;
//     /**
//      * Identifier:
//      * - route: "/users/:id" (normalized leading slash)
//      * - external: "https://..."
//      * - widget: WidgetInfo.id
//      * - backend: "/backend/Service.method" or "/virtual/backend"
//      * - virtual: "/ui/<label>"
//      */
//     id: string;
//     /** Optional human label for UI (not used by engines). */
//     display?: string;
// }

// export interface StageAction {
//     /** 0-based order, stable within the list. */
//     order: number;
//     kind: StageActionKind;
//     target: StageTarget;
//     /** For input/change; plain value or option key. */
//     value?: any;
//     /**
//      * Extra hints:
//      * - validators: propagated from WidgetInfo.validationRules
//      * - options: for selects/radios (array of option values/labels)
//      * - via: original interaction event ('click', 'routerLink', ...)
//      * - reason: for noop ("terminal backend step", etc.)
//      */
//     meta?: Record<string, any>;
// }
