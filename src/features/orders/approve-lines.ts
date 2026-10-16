import type { Formatters } from "@/i18n/format";
import type { ActionFailure, OrderRefusalCode } from "@/server/action-result";

// The lines a refused Approve shows (06-approval-workflow.md rules 7 and 8: "names the orders
// that changed … and refreshes"; "the slower user sees 'Already approved by Dilnoza at 14:32'";
// plan of 2.10, decided items 3 and 6). Types only from the server, so the browser may import it.
// The time is Tashkent's, through the shared formatters, as History shows it (review of the plan,
// correction 2; CLAUDE.md rule 10).

/** One order another user approved meanwhile, as approveOrdersAction() answers it. */
export type DecidedOrder = { orderId: string; name: string; at: string };

/** The texts of `orders.approve`, from the caller's translator. */
export type ApproveTexts = {
  alreadyApproved(values: { name: string; date: string; time: string }): string;
  refused(code: OrderRefusalCode): string;
  failedLine(values: { number: string; problem: string }): string;
};

/** "Already approved by Aziz at 16.10.2026 14:32." */
export function alreadyApprovedLine(
  decided: DecidedOrder,
  t: ApproveTexts,
  format: Formatters,
): string {
  const at = new Date(decided.at);
  return t.alreadyApproved({ name: decided.name, date: format.date(at), time: format.time(at) });
}

/** One line per refused order, in the order the server named them. */
export function approveFailureLines(
  error: ActionFailure,
  decided: readonly DecidedOrder[],
  numberOf: (orderId: string) => string,
  t: ApproveTexts,
  format: Formatters,
): { orderId: string; line: string }[] {
  const by = new Map(decided.map((order) => [order.orderId, order]));
  return (error.orders ?? []).map((order) => {
    const approved = by.get(order.orderId);
    const problem = approved ? alreadyApprovedLine(approved, t, format) : t.refused(order.code);
    return {
      orderId: order.orderId,
      line: t.failedLine({ number: numberOf(order.orderId), problem }),
    };
  });
}
