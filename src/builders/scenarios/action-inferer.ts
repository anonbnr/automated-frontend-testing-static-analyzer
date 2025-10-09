// ──────────────────────────────────────────────────────────────────────────────
// builders/scenarios/action-inferer.ts
//
// Pure, deterministic inferer (M1.4):
//   UserJourney + AppNavigation Graph  →  ordered StageAction[]
//
// Mapping:
//   - First route + route transitions → 'navigate' (route/external)
//   - Widgets → usually paired with an 'interaction' step; if missing, guess
//               sensible action (click/input/change) from widget type
//   - interaction.via:
//        click      → click
//        submit     → submit
//        input      → input (with defaultValue)
//        change     → change / check / uncheck
//        routerLink/href/static-redirect → (skip; next step should be route)
//   - backend / virtual-route → noop (oracle hint via meta.reason)
//
// Guarantees:
//   - Deterministic (pure): same input → same output
//   - At least one navigate/click for no-form journeys
//
// Observability:
//   - debug log per emitted action: stepType, via, widgetId, decision
// ──────────────────────────────────────────────────────────────────────────────

import { WidgetUtils } from "../../analyzers/template/widgets/widget-utils.js";
import logger from "../../logging/logger.js";
import { AppNavigation, GraphNode } from "../../models/navigation-graph.js";
import { StageAction, StageTarget } from "../../models/scenarios/stage-action.js";
import { VIRTUAL_BACKEND } from "../../models/user-journeys/user-journey-constants.js";
import { UserJourney, UserJourneyStep } from "../../models/user-journeys/user-journey-info.js";
import { WidgetInfo } from "../../models/widget-info.js";

export interface InferOptions {
    widgetIds?: string[];
}

/** Main entry */
export function inferActions(journey: UserJourney, graph: AppNavigation | null, opts: InferOptions = {}): StageAction[] {
    logger.info(
        "[ActionInferer] inferActions journey=%s steps=%d graphNodes=%d catalog=%d",
        journey?.id,
        journey?.steps?.length ?? 0,
        graph?.nodes?.length ?? 0,
        Array.isArray(opts.widgetIds) ? opts.widgetIds.length : 0
    );

    const actions: StageAction[] = [];
    const push = (a: Omit<StageAction, "order">, why?: string, ctx?: Record<string, any>) => {
        const next = { order: actions.length, ...a } as StageAction;
        actions.push(next);
        logger.debug?.(
            "[ActionInferer] +action #%d kind=%s target=%s:%s%s",
            next.order, next.kind, next.target.type, next.target.id,
            why ? `  (${why}${ctx ? " " + JSON.stringify(ctx) : ""})` : ""
        );
    };

    const nodes = new Map<string, GraphNode>((graph?.nodes || []).map(n => [norm(n.id), n]));
    const widgetsById = collectWidgets(nodes);

    let lastNavTo: string | undefined;
    const steps = (journey?.steps ?? []);

    for (let i = 0; i < steps.length; i++) {
        const st = steps[i];

        switch (st.stepType) {
            case 'route': {
                const id = routeId(st.nodeId);
                if (id !== lastNavTo) {
                    push({ kind: "navigate", target: { type: "route", id } }, "route-transition");
                    lastNavTo = id;
                }
                else logger.debug?.("[ActionInferer] skip duplicate navigate(route) id=%s", id);
                break;
            }

            case 'external-route': {
                const id = st.nodeId;
                if (id !== lastNavTo) {
                    push({ kind: 'navigate', target: { type: 'external', id } }, "external-route");
                    lastNavTo = id;
                }
                else logger.debug?.("[ActionInferer] skip duplicate navigate(external) id=%s", id);
                break;
            }

            case 'widget': {
                // Emit a *targeting* meta-hint only; the actual action usually comes with 'interaction'
                const wid = st.nodeId;
                const w = widgetsById.get(wid);
                if (!w) {
                    logger.debug?.("[ActionInferer] widget step skipped (unknown widget) id=%s", wid);
                    break;
                }

                // If next step is not interaction, try to guess a click to keep minimal coverage.
                const next = steps[i + 1];
                if (!next || next.stepType !== 'interaction') {
                    const kind = guessActionKindFromWidget(w);
                    push(
                        {
                            kind,
                            target: { type: 'widget', id: wid, display: w.type },
                            meta: decorateWidgetMeta(w, /*via*/ undefined)
                        },
                        "widget-without-interaction",
                        { widgetType: w.type }
                    );
                }
                else logger.debug?.("[ActionInferer] widget step defers to following interaction id=%s", wid);
                break;
            }

            case 'interaction': {
                // Map via → action kind
                const via = String(st.via || '').toLowerCase();
                const wid = st.nodeId;
                const w = widgetsById.get(wid);

                if (via === 'routerlink' || via === 'href' || via === 'static-redirect') {
                    // The *following* step is typically a route/external — we avoid double navigation here.
                    // If the next step is missing, we emit a generic navigate to keep coverage.
                    const next = steps[i + 1];
                    if (!next || (next.stepType !== 'route' && next.stepType !== 'external-route')) {
                        push({ kind: 'navigate', target: { type: 'route', id: '/' } }, "link-without-followup");
                    }
                    else logger.debug?.("[ActionInferer] interaction via=%s defers to next step", via);
                    break;
                }

                // UI interactions
                if (!w) {
                    // Unknown widget → fallback click
                    push(
                        {
                            kind: 'click',
                            target: { type: 'widget', id: wid },
                            meta: { via }
                        },
                        "interaction-unknown-widget",
                        { via }
                    );
                    break;
                }

                const meta = decorateWidgetMeta(w, via);

                switch (via) {
                    case 'click':
                        push({ kind: 'click', target: { type: 'widget', id: wid, display: w.type }, meta }, "interaction.click");
                        break;
                    case 'submit':
                        push({ kind: 'submit', target: { type: 'widget', id: wid, display: w.type }, meta }, "interaction.submit");
                        break;
                    case 'input':
                        push(
                            {
                                kind: 'input',
                                target: { type: 'widget', id: wid, display: w.type },
                                value: defaultValueFor(w),
                                meta
                            },
                            "interaction.input",
                            { defaulted: true }
                        );
                        break;
                    case 'change': {
                        const changeKind = changeKindFor(w); // 'change' | 'check' | 'uncheck'
                        push(
                            {
                                kind: changeKind,
                                target: { type: 'widget', id: wid, display: w.type },
                                value: defaultValueFor(w),
                                meta
                            },
                            "interaction.change",
                            { resolvedKind: changeKind, defaulted: true }
                        );
                        break;
                    }
                    default:
                        // Unknown via → best-effort
                        const guessed = guessActionKindFromWidget(w);
                        push(
                            {
                                kind: guessed,
                                target: { type: 'widget', id: wid, display: w.type },
                                meta: { ...meta, via }
                            },
                            "interaction.unknown-via",
                            { via, guessed }
                        );
                }
                break;
            }

            case 'backend': {
                const id = st.nodeId || VIRTUAL_BACKEND;
                push(
                    {
                        kind: 'noop',
                        target: toBackendTarget(id),
                        meta: { reason: 'terminal backend step (oracle hint)' }
                    },
                    "backend"
                );
                break;
            }
            case 'virtual-route': {
                push(
                    {
                        kind: 'noop',
                        target: { type: 'virtual', id: st.nodeId },
                        meta: { reason: 'terminal virtual step (oracle hint)' }
                    },
                    "virtual-route"
                );
                break;
            }
            default:
                // component/module steps do not create actions
                logger.debug?.("[ActionInferer] stepType=%s ignored", st.stepType);
                break;
        }
    }

    // Guarantee at least one navigate/click for no-form journeys
    if (!actions.some(a => a.kind === 'navigate' || a.kind === 'click')) {
        push(
            {
                kind: 'navigate',
                target: { type: 'route', id: firstRoute(steps) ?? '/' }
            },
            "ensure-minimal-coverage"
        );
    }

    // enrich from scenario-subgraph widget catalog (if provided)
    if (Array.isArray(opts.widgetIds) && opts.widgetIds.length) {
        const existingTargets = new Set(
            actions.filter(a => a.target?.type === 'widget').map(a => norm(a.target.id))
        );

        let appended = 0;
        for (const raw of opts.widgetIds) {
            const wid = norm(raw);
            if (existingTargets.has(wid)) continue; // already covered by step-driven inference
            const w = widgetsById.get(wid);
            if (!w) continue;

            const guessed = guessActionKindFromWidget(w);
            push(
                {
                    kind: guessed,
                    target: { type: 'widget', id: wid, display: w.type },
                    value: guessed === 'input' || guessed === 'change' ? defaultValueFor(w) : undefined,
                    meta: decorateWidgetMeta(w, undefined)
                },
                "catalog-extra",
                { widgetType: w.type }
            );
            appended++;
        }
        logger.info("[ActionInferer] catalog enrichment appended %d widget action(s)", appended);
    }

    logger.info("[ActionInferer] produced %d actions", actions.length);
    return actions;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function norm(s: string) { return (s || '').trim(); }
function routeId(s: string) { return ("/" + (s || "").replace(/^\/+/, "")).replace(/\/{2,}/g, "/"); }
function firstRoute(steps: UserJourneyStep[]): string | undefined {
    return steps.find(s => s.stepType === 'route')?.nodeId?.replace(/^\/?/, "/");
}

function collectWidgets(nodes: Map<string, any>): Map<string, WidgetInfo> {
    const m = new Map<string, WidgetInfo>();
    for (const n of nodes.values()) {
        if (n.type === 'widget') {
            const w: WidgetInfo = {
                id: n.id,
                type: n.attributes?.['type'] || n.type,
                events: n.attributes?.['events'] || {},
                attributes: n.attributes ?? {},
                validationRules: n.validationRules ?? [],
                triggersFormSubmission: !!n.triggersFormSubmission,
                children: []
            };
            m.set(w.id, w);
        }
    }
    return m;
}

function decorateWidgetMeta(w: WidgetInfo, via?: string): Record<string, any> {
    const opts = optionsFor(w);
    const selectorHint = selectorHintFor(w);
    return {
        via,
        validators: w.validationRules ?? [],
        options: opts.length ? opts : undefined,
        selectorHint
    };
}

function defaultValueFor(w: WidgetInfo): any {
    // very light defaults for M1.4 (Faker comes in M1.6)
    const t = WidgetUtils.wType(w);
    switch (t) {
        case 'email': return 'user@example.com';
        case 'number': return '1';
        case 'date': return '2000-01-01';
        case 'time': return '12:00';
        case 'month': return '2000-01';
        case 'week': return '2000-W01';
        case 'color': return '#000000';
    }
    const opts = optionsFor(w);
    return opts.length ? opts[0] : '';
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

function optionsFor(w: WidgetInfo): any[] {
    // best-effort: try common shapes or attributes.options
    const a = w.attributes || {};
    const opts = (a['options'] as any[]) || (a['data']?.['options']) || [];
    return Array.isArray(opts) ? opts : [];
}

function guessActionKindFromWidget(w: WidgetInfo): 'click' | 'submit' | 'input' | 'change' {
    const t = WidgetUtils.wType(w);
    if (WidgetUtils.isSubmitButton(t)) return 'submit';
    if (WidgetUtils.isFormField(t)) {
        if (t === 'input' || t === 'textarea' || t === 'email' || t === 'text' || t === 'number' || t === 'date' || t === 'password') {
            return 'input';
        }
        return 'change';
    }
    return 'click';
}

function toBackendTarget(id: string): StageTarget {
    const clean = id?.startsWith('/backend') || id === VIRTUAL_BACKEND ? id : `/backend/${id}`;
    return { type: 'backend', id: clean };
}

function selectorHintFor(w: WidgetInfo): string | undefined {
    const a = w.attributes || {};
    // highest-signal first
    if (a['data-e2e']) return `[data-e2e="${a['data-e2e']}"]`;
    if (a['id']) return `#${a['id']}`;
    if (a['formControlName']) return `[formControlName="${a['formControlName']}"]`;
    if (a['name']) return `[name="${a['name']}"]`;
    if (a['aria-label']) return `[aria-label="${a['aria-label']}"]`;
    if (a['role']) return `[role="${a['role']}"]`;
    // material-ish fallbacks
    if (a['matTooltip']) return `[matTooltip="${a['matTooltip']}"]`;
    return undefined;
}