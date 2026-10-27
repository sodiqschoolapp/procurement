import type { RequestStatus } from "@/domain/request-status";

// Which result sentence a confirm dialog states (11-screens-and-ux.md rule 6: "ask for
// confirmation and state the result"; plan of 4.10c, review Must fix 3 and Should fix 4). Pure,
// for the browser: the screen passes what the server returned, and decides nothing else.

/** How many of the ticked orders skipped Finance (06 Finance step switched off). */
export type SkippedShare = "all" | "some" | "none";

export function skippedShare(flags: readonly boolean[]): SkippedShare {
  if (flags.length > 0 && flags.every(Boolean)) return "all";
  return flags.some(Boolean) ? "some" : "none";
}

/**
 * The Approve dialog's sentence: Finance's step names the cash; the Principal's with the Finance
 * step off says the orders open for buying at once (06 Allowed moves: "Open when the Finance
 * step is off"); the Head's with the Principal step off says they go to Finance, or open for
 * buying at once with both steps off (06 Allowed moves; Principal step switched off 1 and 3; plan
 * of 4.10d); every other step says the next approver is told.
 */
export function approveResultKey(
  statuses: readonly string[],
  financeStep: boolean,
  principalStep = true,
): "resultFinance" | "resultSkipFinance" | "resultSkipPrincipal" | "resultSkipBoth" | "result" {
  const all = (step: RequestStatus) =>
    statuses.length > 0 && statuses.every((status) => status === step);
  if (all("PENDING_FINANCE")) return "resultFinance";
  if (!financeStep && all("PENDING_PRINCIPAL")) return "resultSkipFinance";
  if (!principalStep && all("PENDING_HEAD")) {
    return financeStep ? "resultSkipPrincipal" : "resultSkipBoth";
  }
  return "result";
}

/**
 * Whether a Submit's dialog adds that the Head's own new orders open for buying at once: a Head
 * submits while both steps are off, so a first Submit of an order the Head created opens it with
 * no second approver (03 rule 6; 06 Principal step switched off 3; D69; plan of 4.10d, review of
 * the plan, Must fix 1).
 */
export function headSubmitOpens(
  isHead: boolean,
  principalStep: boolean,
  financeStep: boolean,
): boolean {
  return isHead && !principalStep && !financeStep;
}

/**
 * The Reopen dialog's sentence: "Finance settles them again" is not true of an order that skipped
 * Finance (06 Finance step switched off 6), so those read that the owner closes them again; ticked
 * together, both lines.
 */
export function reopenResultKey(
  skipped: SkippedShare,
): "REOPEN" | "REOPEN_SKIPPED" | "REOPEN_MIXED" {
  if (skipped === "all") return "REOPEN_SKIPPED";
  return skipped === "some" ? "REOPEN_MIXED" : "REOPEN";
}
