// ──────────────────────────────────────────────────────────────────────────────
// models/user-journeys/user-journey-constants.ts
//
// Canonical constants and terminal node kinds for user journeys.
// Keeping these here prevents drift across modules and UIs.
// ──────────────────────────────────────────────────────────────────────────────

/** Canonical synthetic targets used for error and backend sinks. */
export const VIRTUAL_ERROR = "/virtual/error";
export const VIRTUAL_BACKEND = "/virtual/backend";

/**
 * All allowed terminal node kinds for a user journey's final step.
 * These correspond to graph node types that represent a “destination.”
 */
export type TerminalNodeKind =
  | "route"
  | "external-route"
  | "backend"
  | "virtual-route";