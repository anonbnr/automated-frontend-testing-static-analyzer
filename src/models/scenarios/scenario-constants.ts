// src/models/scenarios/scenario-constants.ts
/**
 * Constants & terminal kinds for scenarios.
 * Keep all canonicals here to avoid drift across modules.
 */

export const VIRTUAL_ERROR = "/virtual/error";
export const VIRTUAL_BACKEND = "/virtual/backend";

/** All allowed terminal node kinds in a scenario stream. */
export type TerminalNodeKind =
  | "route"
  | "external-route"
  | "backend"
  | "virtual-route";