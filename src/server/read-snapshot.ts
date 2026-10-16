import type { Executor } from "./authorize";

// One read-only snapshot for a query that reads in several statements (spec review of 2.8, Must
// fix 1): a list whose group rows, their orders and their extra costs come from one moment, so a
// group row always shows the sums of the orders it holds (05-order-request-form.md, Group rows 1;
// 08: "the totals of a group row … are the sums of the order values"). REPEATABLE READ gives every
// statement of the transaction the snapshot of its first; READ ONLY lets nothing write through it.
// It writes nothing, so it is not the action wrapper's transaction (developer-rules.md rule 3).

export async function readSnapshot<T>(work: (executor: Executor) => Promise<T>): Promise<T> {
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("./db/client");
  return db.transaction(async (tx) => work(tx), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
