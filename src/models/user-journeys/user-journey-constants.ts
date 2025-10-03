// src/models/user-journeys/user-journey-constants.ts
/**
 * Constants & terminal kinds for user journeys.
 * Keep all canonicals here to avoid drift across modules.
 */

export const VIRTUAL_ERROR = "/virtual/error";
export const VIRTUAL_BACKEND = "/virtual/backend";

/** All allowed terminal node kinds in a user journey stream. */
export type TerminalNodeKind =
  | "route"
  | "external-route"
  | "backend"
  | "virtual-route";