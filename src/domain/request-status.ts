// The ten request statuses of docs/spec/06-approval-workflow.md, "Statuses", as codes only, in
// the spec's order. The state machine of phase 2 imports this list and adds the allowed moves,
// so the codes live once (developer-rules.md rule 2; plan of 0.10a, decision 8). The words
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
