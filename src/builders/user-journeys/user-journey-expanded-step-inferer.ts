// ──────────────────────────────────────────────────────────────────────────────
// builders/user-journeys/user-journey-step-inferer.ts
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetUtils } from "../../analyzers/template/widgets/widget-utils.js";
import logger from "../../logging/logger.js";
import { AppNavigation, GraphNode } from "../../models/navigation-graph.js";
import { StageActionType, StageTarget } from "../../models/scenarios/scenario-steps.js";
import { VIRTUAL_BACKEND } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourneyExpandedStep } from "../../models/user-journeys/user-journey-expanded-step.js";
import { UserJourney, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { WidgetInfo } from "../../models/widget-info.js";

export interface InferOptions {
    widgetIds?: string[];
    widgetsMap: Map<string, WidgetInfo>;
}

/** Main entry */
// export function inferActions(journey: UserJourney, graph: AppNavigation | null, opts: InferOptions): UserJourneyExpandedStep[] {
export function inferExpandedSteps(steps: UserJourneyStep[], widgets: WidgetInfo[]): UserJourneyExpandedStep[] {

    const actions: UserJourneyExpandedStep[] = [];

    const widgetsById = new Map<string, WidgetInfo>();
    for (const widget of widgets) {
        widgetsById.set(widget.id, widget);
    }

    let lastNavTo: string | undefined;
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        switch (step.stepType) {
            case 'route': {
                const id = routeId(step.nodeId);
                if (id !== lastNavTo) {
                    actions.push({actionType: "navigate", target: { type: "route", id }});
                    lastNavTo = id;
                }
                break;
            }

            case 'external-route': {
                const id = step.nodeId;
                if (id !== lastNavTo) {
                    actions.push({ actionType: 'navigate', target: { type: 'external', id } });
                    lastNavTo = id;
                }
                break;
            }

            case 'widget': {
                // Emit a *targeting* meta-hint only; the actual action usually comes with 'interaction'
                const widgetId = step.nodeId;
                const widget = widgetsById.get(widgetId);
                if (!widget) {
                    break;
                }

                // If next step is not interaction, try to guess a click to keep minimal coverage.
                const next = steps[i + 1];
                if (!next || next.stepType !== 'interaction') {
                    const actionType = guessActionTypeFromWidget(widget);
                    actions.push(
                        {
                            actionType,
                            target: { type: 'widget', id: widgetId, display: widget.type },
                            meta: decorateWidgetMeta(widget, /*via*/ undefined),
                            validationRules: widget.validationRules,
                            triggersFormSubmission: widget.triggersFormSubmission,
                            sensitiveData: guessSensitiveData(widget),
                        }
                    );
                }
                break;
            }

            case 'interaction': {
                // Map via → action actionType
                const via = String(step.via || '').toLowerCase();
                const widgetId = step.nodeId;
                const widget = widgetsById.get(widgetId);

                if (via === 'routerlink' || via === 'href' || via === 'static-redirect') {
                    // The *following* step is typically a route/external — we avoid double navigation here.
                    // If the next step is missing, we emit a generic navigate to keep coverage.
                    const next = steps[i + 1];
                    if (!next || (next.stepType !== 'route' && next.stepType !== 'external-route')) {
                        actions.push({ actionType: 'navigate', target: { type: 'route', id: '/' } });
                    }
                    break;
                }

                // UI interactions
                if (!widget) {
                    // Unknown widget → fallback click
                    actions.push(
                        {
                            actionType: 'click',
                            target: { type: 'widget', id: widgetId },
                            meta: { via },
                            sensitiveData: false,
                            triggersFormSubmission: false,
                        }
                    );
                    break;
                }

                let meta = decorateWidgetMeta(widget, via);
                let actionType: StageActionType;
                let value = undefined;
                switch (via) {
                    case 'click':
                        actionType = 'click';
                        break;
                    case 'submit':
                        actionType = 'submit';
                        break;
                    case 'input':
                        actionType = 'input';
                        break;
                    case 'change': {
                        actionType = changeKindFor(widget); // 'change' | 'check' | 'uncheck'
                        break;
                    }
                    default:
                        // Unknown via → best-effort
                        actionType = guessActionTypeFromWidget(widget);
                        meta = {...meta, via};
                }
                actions.push({
                    actionType: actionType,
                    target: { type: 'widget', id: widgetId, display: widget.type },
                    validationRules: widget.validationRules,
                    triggersFormSubmission: widget.triggersFormSubmission,
                    sensitiveData: guessSensitiveData(widget),
                    meta
                })
                break;
            }

            case 'backend': {
                const id = step.nodeId || VIRTUAL_BACKEND;
                actions.push(
                    {
                        actionType: 'noop',
                        target: toBackendTarget(id),
                        meta: { reason: 'terminal backend step (oracle hint)' }
                    },
                );
                break;
            }
            case 'virtual-route': {
                actions.push(
                    {
                        actionType: 'noop',
                        target: { type: 'virtual', id: step.nodeId },
                        meta: { reason: 'terminal virtual step (oracle hint)' }
                    }
                );
                break;
            }
        }
    }

    // Guarantee at least one navigate/click for no-form journeys
    if (!actions.some(a => a.actionType === 'navigate' || a.actionType === 'click')) {
        actions.push(
            {
                actionType: 'navigate',
                target: { type: 'route', id: firstRoute(steps) ?? '/' }
            }
        );
    }

    // enrich from scenario-subgraph widget catalog (if provided)
    const existingTargets = new Set(
        actions.filter(a => a.target?.type === 'widget').map(a => norm(a.target.id))
    );

    let appended = 0;
    for (const widget of widgets) {
        if (existingTargets.has(widget.id)) continue; // already covered by step-driven inference

        const guessed = guessActionTypeFromWidget(widget);
        actions.push(
            {
                actionType: guessed,
                target: { type: 'widget', id: widget.id, display: widget.type },
                meta: decorateWidgetMeta(widget, undefined),
                validationRules: widget.validationRules,
                triggersFormSubmission: widget.triggersFormSubmission,
                sensitiveData: guessSensitiveData(widget),
            }
        );
        appended++;
    }
    return actions;
}


// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s: string) { return (s || '').trim(); }
function routeId(s: string) { return ("/" + (s || "").replace(/^\/+/, "")).replace(/\/{2,}/g, "/"); }
function firstRoute(steps: UserJourneyStep[]): string | undefined {
    return steps.find(s => s.stepType === 'route')?.nodeId?.replace(/^\/?/, "/");
}

function decorateWidgetMeta(w: WidgetInfo, via?: string): Record<string, any> {
    const opts = optionsFor(w);
    const selectorHint = selectorHintFor(w);
    return {
        via,
        options: opts.length ? opts : undefined,
        selectorHint
    };
}

function changeKindFor(w: WidgetInfo): 'change' | 'check' | 'uncheck' {
    const t = WidgetUtils.wType(w);
    if (t === 'checkbox' || t === 'mat-checkbox') {
        // default toward 'check' if requiredTrue exists
        return (w.validationRules || []).some(v => /requiredTrue/i.test(v)) ? 'check' : 'change';
    }
    if (t === 'mat-radio-button' || t === 'mat-radio-group') return 'change';
    return 'change';
}

function optionsFor(widget: WidgetInfo): any[] {
    // best-effort: try common shapes or attributes.options
    const a = widget.attributes || {};
    const opts = (a['options'] as any[]) || (a['data']?.['options']) || [];
    return Array.isArray(opts) ? opts : [];
}

function guessActionTypeFromWidget(widget: WidgetInfo): 'click' | 'submit' | 'input' | 'change' {
    const inputTypes = ['input', 'textarea', 'email', 'text', 'number', 'date', 'password',
        'file'
    ];
    
    const type = WidgetUtils.wType(widget);

    if (WidgetUtils.isSubmitButton(type))
        return 'submit';

    if (WidgetUtils.isFormField(type)) {
        if (inputTypes.includes(type))
            return 'input';
        else
            return 'change';
    }

    return 'click';
}

function guessSensitiveData(widget: WidgetInfo) {
    const sensitiveTypes = ['password'];

    const type = WidgetUtils.wType(widget);
    
    return sensitiveTypes.includes(type);
}

function toBackendTarget(id: string): StageTarget {
    const clean = id?.startsWith('/backend') || id === VIRTUAL_BACKEND ? id : `/backend/${id}`;
    return { type: 'backend', id: clean };
}

function selectorHintFor(widget: WidgetInfo): string | undefined {
    const attributes = widget.attributes || {};
    // highest-signal first
    if (attributes['data-e2e'])
        return `[data-e2e="${attributes['data-e2e']}"]`;
    
    if (attributes['id'])
        return `#${attributes['id']}`;
    
    if (attributes['formControlName'])
        return `[formControlName="${attributes['formControlName']}"]`;
    
    if (attributes['name'])
        return `[name="${attributes['name']}"]`;
    
    if (attributes['aria-label'])
        return `[aria-label="${attributes['aria-label']}"]`;
    
    if (attributes['role'])
        return `[role="${attributes['role']}"]`;
    
    // material-ish fallbacks
    if (attributes['matTooltip'])
        return `[matTooltip="${attributes['matTooltip']}"]`;
    
    return undefined;
}