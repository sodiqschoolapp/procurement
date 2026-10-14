import { type SQL, sql } from "drizzle-orm";

// A statement of a plain .mjs file (audit-row.mjs, notification-row.mjs), written with `$1 … $n`,
// run through Drizzle with its values bound, never pasted into the text.

/** `$1 … $n` of a statement as bound parameters of Drizzle's `sql`. */
export function bound(text: string, values: readonly unknown[]): SQL {
  const parts = text.split(/\$(\d+)/);
  return sql.join(
    parts.map((part, index) =>
      index % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`,
    ),
  );
}
