import { catalogName } from "./catalogs";

// Product suggestions (04-catalogs.md rule 8: "A Manager who needs something missing from the
// catalog sends a suggestion: name, measure, photo, note. The Head adds it (possibly edited) or
// declines with a reason. The Manager is notified either way"; 14-data-model.md,
// catalog_suggestions; build-plan 1.12). Pure: the actions of
// src/features/catalog/actions/suggestions.ts and the screens ask these.

/** 14-data-model.md, catalog_suggestions.status. */
export const SUGGESTION_STATUSES = ["PENDING", "ADDED", "DECLINED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export function isSuggestionStatus(value: unknown): value is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly unknown[]).includes(value);
}

/** What the Head decides: add to the catalog or decline (04 rule 8). */
export type SuggestionOutcome = "added" | "declined";

/**
 * The one move of a suggestion: a pending one is added or declined, once; a decided one moves
 * nowhere (plan of 1.12, decision 9). The guard trigger of migration 0017 says the same.
 */
export function canDecide(status: SuggestionStatus): boolean {
  return status === "PENDING";
}

/** The status a decision leaves. */
export function statusAfter(outcome: SuggestionOutcome): SuggestionStatus {
  return outcome === "added" ? "ADDED" : "DECLINED";
}

/** "Measure as text" (build-plan 1.12): 1 to 30 code points (plan of 1.12, decision 5). */
export const UNIT_TEXT_MAX = 30;

/** The note and the decline reason: 1 to 500 code points (decision 5). */
export const SUGGESTION_NOTE_MAX = 500;

function lengthOf(value: string): number {
  return Array.from(value).length;
}

/** A measure text as it is stored: trimmed, inner spaces collapsed, as a catalog name. */
export const unitText = catalogName;

/** A stored measure text: 1 to 30 code points, in the form of unitText(). */
export function isUnitText(value: unknown): value is string {
  if (typeof value !== "string" || unitText(value) !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= UNIT_TEXT_MAX;
}

/** A note or a reason as it is stored: trimmed at both ends. */
export function suggestionNote(value: string): string {
  return value.trim();
}

/** A stored note or decline reason: trimmed, 1 to 500 code points. */
export function isSuggestionNote(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= SUGGESTION_NOTE_MAX;
}

/** 25 rows a page (11-screens-and-ux.md rule 8). */
export const SUGGESTIONS_PAGE_SIZE = 25;
