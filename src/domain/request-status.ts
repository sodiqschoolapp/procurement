// The ten request statuses of docs/spec/06-approval-workflow.md, "Statuses", as codes only, in
// the spec's order. The state machine, src/domain/order-moves.ts, adds the allowed moves to these
// codes, so they live once (developer-rules.md rule 2; plan of 0.10a, decision 8). The words
// shown for them are `requestStatus.<CODE>` in the three message files.

export const REQUEST_STATUSES = [
  "DRAFT",
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
  "RETURNED",
  "PURCHASING",
  "SETTLEMENT",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * The statuses nobody acts on next (06 Statuses: "Who acts next" is Nobody): an order in any other
 * status is unfinished, and blocks closing its branch (edge-cases/requests-and-approval.md, "The
 * Head wants to close a branch"; plan of 5.12, decided item 1, Look first).
 */
export const FINISHED_REQUEST_STATUSES = [
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly RequestStatus[];
