import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// edge-cases/developer-rules.md rule 12: "Analytics read from summary tables refreshed every 5
// minutes, never from raw rows on each click" (plan of 9.2, What will exist 7; decided item 4, Look
// first). Every source file of src/features/analytics/ is read (its tests are not: they write the
// raw rows on purpose; review of the plan, correction 6), and a raw table it names in SQL must be
// one listed here with the reason it is read. The numbers, charts and blocks come from the
// analytics_* tables; what is listed reads an order by the id a summary row names.

const ROOT = join(process.cwd(), "src", "features", "analytics");

/** The raw tables of the app: the rows the summary tables are built from. */
const RAW =
  /\b(?:from|join)\s+"?(orders|order_events|order_actions|order_extras|order_revisions|order_settlements|purchases|purchase_trips|purchase_extras|stock_movements|stock_balances|stock_documents|stock_document_lines|money_actions|money_rows)\b/g;

const WALL =
  "the draft wall or the live status of the summary row's order, by its id (.claude/rules/server-actions.md: a query that reads orders by id puts the draft wall in the SQL)";
const LIST =
  "a drill-down list of orders opened from a number: the orders themselves, by the ids of the summary rows, 25 a page (11-screens-and-ux.md rule 8)";
const LIVE =
  "a block over summary rows that shows each order's live status or plan, joined by the summary row's order id (decided item 4: not moved, its tests would change)";

const ALLOWED: Record<string, { tables: string[]; reason: string }> = {
  "cash-where.ts": { tables: ["orders"], reason: WALL },
  "steps-where.ts": { tables: ["orders"], reason: WALL },
  "needed-where.ts": { tables: ["orders"], reason: WALL },
  "orders-where.ts": { tables: ["orders"], reason: WALL },
  "money-where.ts": { tables: ["orders"], reason: WALL },
  "queries/outcome-orders.ts": { tables: ["orders"], reason: LIST },
  "queries/approval-orders.ts": { tables: ["orders"], reason: LIST },
  "queries/stock-moves.ts": { tables: ["stock_documents"], reason: LIST },
  "queries/settlements.ts": { tables: ["orders"], reason: LIST },
  "queries/cancelled-records.ts": {
    tables: ["purchases", "purchase_trips", "orders"],
    reason: LIST,
  },
  "queries/spending-records.ts": { tables: ["orders", "purchases"], reason: LIST },
  "queries/status-orders.ts": { tables: ["orders"], reason: LIST },
  "queries/needed-orders.ts": { tables: ["orders"], reason: LIST },
  "queries/money-rows.ts": { tables: ["money_rows", "money_actions", "orders"], reason: LIST },
  "queries/cash-orders.ts": { tables: ["orders"], reason: LIST },
  "queries/my-cash.ts": { tables: ["orders"], reason: LIVE },
  "queries/managers.ts": { tables: ["orders"], reason: LIVE },
  "queries/finance-cash.ts": { tables: ["orders"], reason: LIVE },
  "queries/my-estimates.ts": { tables: ["orders"], reason: LIVE },
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("Analytics read summary tables (developer-rules.md rule 12)", () => {
  it("names no raw table outside the listed reads by id", () => {
    const found: Record<string, string[]> = {};
    for (const path of sources(ROOT)) {
      const tables = [...readFileSync(path, "utf8").matchAll(RAW)].map((match) => match[1]!);
      if (tables.length > 0) found[relative(ROOT, path)] = [...new Set(tables)].sort();
    }
    const expected = Object.fromEntries(
      Object.entries(ALLOWED).map(([file, { tables }]) => [file, [...tables].sort()]),
    );
    expect(found).toEqual(expected);
  });

  it("finds a raw read it is shown (the check can fail)", () => {
    const sample = "select sum(r.amount) from money_rows r join orders o on o.id = r.order_id";
    expect([...sample.matchAll(RAW)].map((match) => match[1])).toEqual(["money_rows", "orders"]);
  });
});
