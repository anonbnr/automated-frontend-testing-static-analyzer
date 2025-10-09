// ──────────────────────────────────────────────────────────────────────────────
// parsers/stage-action-dsl.ts
//
// StageAction DSL parser (line-based, minimal syntax).
// Produces ordered StageAction[] + diagnostics (non-fatal).
//
// Examples:
//   NAVIGATE "/login"
//   INPUT #email = "user@example.com"
//   CHANGE #country = "US"
//   CLICK #submit
//   NOOP "terminal backend step"
//
// Notes:
// - Lines starting with "#" or "//" are comments.
// - Unknown commands push an error diagnostic but do not throw.
// - We keep parsing after errors to report as much as possible.
// - Widget references can be:
//     #id
//     attr(name="value", role="button")   // carried as display + synthetic id "attr:…"
// ──────────────────────────────────────────────────────────────────────────────
import logger from "../logging/logger.js";
import { StageAction, StageTarget } from "../models/scenarios/stage-action.js";

export interface ActionDiagnostic {
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
}

export interface ParseActionsResult {
    actions: StageAction[];
    diagnostics: ActionDiagnostic[];
}

/**
 * DSL (line-based):
 *   NAVIGATE "/path" | "https://..."
 *   CLICK #<widgetId> | attr(k="v", ...)
 *   SUBMIT #<widgetId> | attr(...)
 *   INPUT  <ref> = "value"
 *   CHANGE <ref> = "value"
 *   CHECK  <ref>
 *   UNCHECK <ref>
 *   NOOP "reason"
 *
 * <ref> = #id | attr(k="v", ...)
 */
const RX = {
    COMMENT: /^\s*(#|\/\/)/,
    QUOTED: /^"([^"]*)"$/,
    REF_ID: /^#([\w\-:./]+)$/,
    ATTR_FN: /^attr\((.+)\)$/i,
    ATTR_KV: /^\s*([A-Za-z_][\w\-]*)\s*=\s*"([^"]*)"\s*$/,
};

/** Entry point */
export function parseActions(script: string): ParseActionsResult {
    logger.info("[StageActionDSL] parseActions length=%d", script?.length ?? 0);
    const diagnostics: ActionDiagnostic[] = [];
    const out: StageAction[] = [];

    const push = (a: Omit<StageAction, "order">, line?: number) => {
        const next = { order: out.length, ...a } as StageAction;
        out.push(next);
        logger.debug?.(
            "[StageActionDSL] +action #%d kind=%s target=%s:%s line=%s",
            next.order,
            next.kind,
            next.target.type,
            next.target.id,
            line ?? "-"
        );
    };

    const lines = (script || "").split(/\r?\n/);

    lines.forEach((raw, i) => {
        const line = i + 1;
        const text = raw.trim();
        if (!text || RX.COMMENT.test(text)) return;

        const head = text.split(/\s+/, 1)[0].toUpperCase();
        const tail = text.slice(head.length).trim();

        try {
            switch (head) {
                case 'NAVIGATE': {
                    const t = parseQuoted(tail) ?? tail;
                    const target: StageTarget = isExternal(t)
                        ? { type: 'external', id: t }
                        : { type: 'route', id: normalizeRoute(t) };
                    push({ kind: 'navigate', target });
                    break;
                }
                case 'CLICK':
                case 'SUBMIT':
                case 'CHECK':
                case 'UNCHECK': {
                    const ref = parseTargetFromRef(tail);
                    if (!ref) return err(`${head} needs a widget ref`, line);
                    const kind = head.toLowerCase() as any;
                    push({ kind, target: ref });
                    break;
                }
                case 'INPUT':
                case 'CHANGE': {
                    const [lhs, rhs] = splitAssign(tail);
                    const ref = parseTargetFromRef(lhs);
                    const value = parseQuoted(rhs) ?? rhs;
                    if (!ref || value == null) return err(`${head} needs <ref> = "value"`, line);
                    const kind = head.toLowerCase() as any;
                    push({ kind, target: ref, value });
                    break;
                }

                case 'NOOP': {
                    const reason = parseQuoted(tail) ?? (tail || 'noop');
                    push({ kind: 'noop', target: { type: 'virtual', id: '/ui/noop' }, meta: { reason } });
                    break;
                }

                default:
                    return err(`Unknown command "${head}"`, line);
            }
        } catch (e: any) {
            err(`Parser error: ${e?.message ?? e}`, line);
        }
    });

    function err(message: string, line: number) {
        diagnostics.push({ line, column: 1, message, severity: 'error' });
        logger.warn("[StageActionDSL] %s at line %d", message, line);
    }

    return { actions: out, diagnostics };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function parseQuoted(s: string): string | undefined {
    const m = s?.trim().match(RX.QUOTED);
    return m ? m[1] : undefined;
}

function splitAssign(s: string): [string, string] {
    const m = s.split("=").map(t => t.trim());
    return [m[0] ?? "", m.slice(1).join("=").trim()];
}

function parseTargetFromRef(raw: string): StageTarget | undefined {
    const t = raw.trim();
    const idm = t.match(RX.REF_ID);
    if (idm) return { type: 'widget', id: idm[1] };
    const am = t.match(RX.ATTR_FN);
    if (am) {
        // attr(...) stays in meta for later FE resolution — we keep a synthetic id
        return { type: 'widget', id: `attr:${am[1]}`, display: `attr(${am[1]})` };
    }
    return undefined;
}

function isExternal(s: string): boolean { 
    return /^https?:\/\//i.test(s);
}

function normalizeRoute(s: string): string { 
    return ("/" + (s || "").replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
}