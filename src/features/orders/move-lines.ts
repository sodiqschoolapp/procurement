import type { DecidedVerb } from "@/domain/already-decided";
import type { Formatters } from "@/i18n/format";
import type { ActionFailure, OrderRefusalCode } from "@/server/action-result";

// The lines a refused move on ticked orders shows (06-approval-workflow.md rules 7 and 8: "names
// the orders that changed … and refreshes"; "the slower user sees 'Already approved by Dilnoza at
// 14:32'"; plan of 2.10, decided items 3 and 6; plan of 2.11, decided item 7: the other verbs).
// Types only from the server and the domain, so the browser may import it. The time is
// Tashkent's, through the shared formatters, as History shows it (review of the plan of 2.10,
// correction 2; CLAUDE.md rule 10).

/** One order another user moved meanwhile, as the page's move actions answer it. */
export type DecidedOrder = { orderId: string; verb: DecidedVerb; name: string; at: string };

/** The texts of a move, from the caller's translator. */
export type MoveTexts = {
  alreadyDecided(verb: DecidedVerb, values: { name: string; date: string; time: string }): string;
  refused(code: OrderRefusalCode): string;
  failedLine(values: { number: string; problem: string }): string;
};

/** "Already approved by Aziz at 16.10.2026 14:32." and its other verbs. */
export function alreadyDecidedLine(
  decided: DecidedOrder,
  t: MoveTexts,
  format: Formatters,
): string {
  const at = new Date(decided.at);
  return t.alreadyDecided(decided.verb, {
    name: decided.name,
    date: format.date(at),
    time: format.time(at),
  });
}

/** One line per refused order, in the order the server named them. */
export function moveFailureLines(
  error: ActionFailure,
  decided: readonly DecidedOrder[],
  numberOf: (orderId: string) => string,
  t: MoveTexts,
  format: Formatters,
): { orderId: string; line: string }[] {
  const by = new Map(decided.map((order) => [order.orderId, order]));
  return (error.orders ?? []).map((order) => {
    const moved = by.get(order.orderId);
    const problem = moved ? alreadyDecidedLine(moved, t, format) : t.refused(order.code);
    return {
      orderId: order.orderId,
      line: t.failedLine({ number: numberOf(order.orderId), problem }),
    };
  });
}
