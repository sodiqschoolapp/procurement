import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";

import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import pg from "pg";

import { SCREENS, type ScreenIds, type Who } from "../e2e/screens";
import { speedDatabaseUrl } from "./database";
import { SPEED_PASSWORD, SPEED_PEOPLE } from "./fill";

// The measurement of build plan 9.2 (plan of 9.2, What will exist 3 and 4): every screen of the
// shared list as the role that opens it, on the production build against procurement_speed, once
// to warm up and three times measured. A load runs from navigation start until the load event has
// ended and no loading area (`aria-busy="true"`, the grey placeholders of 11 rule 5) is left, so
// streamed content counts (review of the plan, correction 1). Prefetch requests are aborted, so
// only the page itself is timed and counted (correction 3). The statements each load sent are
// counted from PostgreSQL's log of this database (log_statement = 'all'). The test fails for a
// page whose slowest load is 1 second or more (01-summary.md, Quality bar: Fast), and the run
// writes docs/speed.md.

const LIMIT_MS = 1000;
/** Marks this run's statements apart from an earlier run's in the same log. */
const RUN = randomUUID().slice(0, 8);
const TIMED = 3;
const RESULTS = "test-results/speed-pages.json";
const TABLE = "docs/speed.md";

type Result = {
  route: string;
  who: Who | null;
  note: string;
  url: string;
  times: number[];
  statements: number | null;
  rows: number | null;
};

/**
 * The screens that are lists paged by the server (11-screens-and-ux.md rule 8: "25 rows per page,
 * loaded from the server"): the paging check reads these; a page's other tables (a chart's data,
 * a form's lines) are no list.
 */
const PAGED = new Set([
  "/orders",
  "/notifications",
  "/users",
  "/branches",
  "/suggestions",
  "/prices",
  "/catalog/[catalog]",
  "/catalog/departments",
  "/catalog/products",
  "/warehouse/documents",
  "/warehouse/stock",
  "/warehouse/counts",
  "/analytics/approvals",
  "/analytics/cancelled",
  "/analytics/cash-needed",
  "/analytics/cash",
  "/analytics/money",
  "/analytics/moves",
  "/analytics/order-status",
  "/analytics/orders",
  "/analytics/records",
  "/analytics/settlements",
  "/analytics/stock",
]);

const results: Result[] = [];
let ids: ScreenIds;
let usernames: Record<Who, string>;
const states = new Map<Who, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function readIds(): Promise<ScreenIds> {
  const client = new pg.Client({ connectionString: speedDatabaseUrl() });
  await client.connect();
  try {
    const one = async (text: string, values: unknown[] = []) => {
      const { rows } = await client.query(text, values);
      if (!rows[0]) throw new Error(`The speed database has no row for: ${text}`);
      return rows[0] as Record<string, string>;
    };
    const manager = await one("select id from users where username = $1", [SPEED_PEOPLE.manager]);
    const branch = await one("select id from branches where code = 'SA'");
    const order = (status: string, extra = "") =>
      one(
        `select id, variant_id from orders where branch_id = $1 and owner_id = $2
         and status = $3 ${extra} order by created_at desc limit 1`,
        [branch.id, manager.id, status],
      );
    const product = await one(
      "select p.id, v.id as variant from products p join product_variants v on v.product_id = p.id where p.has_variants order by p.name, v.name limit 1",
    );
    const settling = await one(
      "select id, variant_id from orders where branch_id = $1 and status = 'SETTLEMENT' order by created_at desc limit 1",
      [branch.id],
    );
    return {
      branch: branch.id!,
      department: (
        await one("select id from departments where branch_id = $1 order by name limit 1", [
          branch.id,
        ])
      ).id!,
      manager: manager.id!,
      unit: (await one("select id from units order by name limit 1")).id!,
      product: product.id!,
      subtype: product.variant!,
      suggestion: (
        await one(
          "select id from catalog_suggestions where branch_id = $1 and status = 'PENDING' limit 1",
          [branch.id],
        )
      ).id!,
      document: (
        await one(
          "select id from stock_documents where branch_id = $1 and type = 'ISSUE' order by created_at desc limit 1",
          [branch.id],
        )
      ).id!,
      draft: (await order("DRAFT")).id!,
      waiting: (
        await one(
          "select id from orders where branch_id = $1 and status = 'PENDING_HEAD' order by created_at desc limit 1",
          [branch.id],
        )
      ).id!,
      open: (await order("PURCHASING", "and progress = 'OPEN'")).id!,
      settling: settling.id!,
      settlingVariant: settling.variant_id!,
    };
  } finally {
    await client.end();
  }
}

/** The PostgreSQL container of docker-compose.yml, or null where Docker cannot be read. */
function container(): string | null {
  try {
    const id = execFileSync("docker", ["compose", "ps", "-q", "postgres"], { encoding: "utf8" });
    return id.trim() || null;
  } catch {
    return null;
  }
}
const postgres = container();

/** A statement the log shows, sent from the run's own connection, around each measured load. */
async function mark(text: string): Promise<void> {
  await marker!.query(`select '${text}'`);
}
let marker: pg.Client | null = null;

/** The statements PostgreSQL logged between two marks (log_statement = 'all' on this database). */
function statementsBetween(start: string, end: string, tail = 20_000): number | null {
  if (postgres === null) return null;
  // PostgreSQL logs to its stderr, which `docker logs` hands back on stderr. Read from the end:
  // `--since` reads the whole log file, which this run makes large.
  const log = spawnSync("docker", ["logs", "--tail", String(tail), postgres], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = `${log.stdout}\n${log.stderr}`.split("\n");
  const from = lines.findIndex((line) => line.includes(start));
  const to = lines.findIndex((line) => line.includes(end));
  if (from < 0 || to < from) return null;
  return lines.slice(from + 1, to).filter((line) => /LOG: {2}(statement|execute [^:]*):/.test(line))
    .length;
}

/** One load: the milliseconds until the page and its streamed parts are there. */
async function load(page: Page, url: string): Promise<number> {
  const response = await page.goto(url, { waitUntil: "load" });
  expect(response?.ok(), url).toBe(true);
  const handle = await page.waitForFunction(
    () =>
      document.readyState === "complete" && document.querySelector('[aria-busy="true"]') === null
        ? performance.now()
        : false,
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
  return Math.round((await handle.jsonValue()) as number);
}

/** The most rows one table of the page draws: a group row of the order list counts once. */
function rowsOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    let most = 0;
    for (const table of document.querySelectorAll("main table")) {
      const groups = table.querySelectorAll(":scope > tbody[data-group]").length;
      const rows = groups || table.querySelectorAll(":scope > tbody > tr").length;
      most = Math.max(most, rows);
    }
    return most;
  });
}

async function measure(page: Page, entry: Omit<Result, "times" | "statements" | "rows">) {
  await load(page, entry.url);
  const times: number[] = [];
  let statements: number | null = null;
  for (let n = 0; n < TIMED; n += 1) {
    const id = `${RUN}-${results.length}-${n}`;
    await mark(`speed-start-${id}`);
    times.push(await load(page, entry.url));
    // What the page sends after its load event (a streamed part's late statement) still counts.
    await page.waitForTimeout(300);
    await mark(`speed-end-${id}`);
    if (n === TIMED - 1) {
      await page.waitForTimeout(200);
      statements = statementsBetween(`speed-start-${id}`, `speed-end-${id}`);
      // A page of many long statements can push its marks further back, or the log comes late.
      for (let wait = 0; statements === null && wait < 3; wait += 1) {
        await page.waitForTimeout(1000);
        statements = statementsBetween(`speed-start-${id}`, `speed-end-${id}`, 100_000);
      }
    }
  }
  const result: Result = { ...entry, times, statements, rows: await rowsOf(page) };
  results.push(result);
  return result;
}

test.afterAll(async () => {
  await marker?.end();
});

test.beforeAll(async ({ browser }) => {
  ids = await readIds();
  marker = new pg.Client({ connectionString: speedDatabaseUrl() });
  await marker.connect();
  usernames = SPEED_PEOPLE;
  for (const who of Object.keys(usernames) as Who[]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator("#username").fill(usernames[who]);
    await page.locator("#password").fill(SPEED_PASSWORD);
    await page.locator("form button[type=submit]").click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    states.set(who, await context.storageState());
    await context.close();
  }
});

/** The large lists, measured at their first page, their last, and filtered and sorted (rule 8). */
function listUrls(): { route: string; who: Who; note: string; url: string }[] {
  const lists: { route: string; who: Who; first: string; filtered: string }[] = [
    {
      route: "/orders",
      who: "head",
      first: "/orders",
      filtered: "/orders?status=CLOSED&payment=CASH&sort=submitted",
    },
    {
      route: "/orders",
      who: "manager",
      first: "/orders",
      filtered: `/orders?branch=${ids.branch}&sort=product`,
    },
    {
      route: "/warehouse/documents",
      who: "head",
      first: "/warehouse/documents",
      filtered: `/warehouse/documents?type=ISSUE&branch=${ids.branch}`,
    },
    {
      route: "/warehouse/stock",
      who: "head",
      first: "/warehouse/stock",
      filtered: "/warehouse/stock?q=Mahsulot%201&low=1",
    },
    {
      route: "/notifications",
      who: "head",
      first: "/notifications",
      filtered: "/notifications?page=2",
    },
    {
      route: "/catalog/products",
      who: "head",
      first: "/catalog/products",
      filtered: "/catalog/products?q=Mahsulot%201&type=GOODS",
    },
    { route: "/prices", who: "head", first: "/prices", filtered: "/prices?q=Tur" },
    { route: "/users", who: "head", first: "/users", filtered: "/users?page=2" },
  ];
  return lists.flatMap((list) => [
    { route: list.route, who: list.who, note: "first page", url: list.first },
    {
      route: list.route,
      who: list.who,
      note: "last page",
      url: `${list.first}${list.first.includes("?") ? "&" : "?"}page=9999`,
    },
    { route: list.route, who: list.who, note: "filtered and sorted", url: list.filtered },
  ]);
}

test("every page opens in under 1 second at the fill's volume (01-summary.md, Quality bar: Fast; 11 rule 8)", async ({
  browser,
}) => {
  const entries = [
    ...SCREENS.map((screen) => ({
      route: screen.route,
      who: screen.who,
      note: screen.note,
      url: screen.url(ids),
    })),
    ...listUrls(),
  ];
  const contexts = new Map<Who | null, BrowserContext>();
  // SPEED_ONLY=<text> measures only the addresses holding it (for a quick look; no table then).
  const only = process.env.SPEED_ONLY;
  for (const entry of entries) {
    if (only && !`${entry.url} ${entry.who}`.includes(only)) continue;
    let context = contexts.get(entry.who);
    if (context === undefined) {
      context = await browser.newContext({
        ...(entry.who ? { storageState: states.get(entry.who) } : {}),
      });
      // Prefetch is not the page (review of the plan, correction 3).
      await context.route("**/*", (route) =>
        route.request().headers()["next-router-prefetch"] ? route.abort() : route.continue(),
      );
      contexts.set(entry.who, context);
    }
    const page = context.pages()[0] ?? (await context.newPage());
    await measure(page, entry);
  }
  for (const context of contexts.values()) await context.close();
  writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  if (!only) writeTable();

  const slow = results.filter((result) => Math.max(...result.times) >= LIMIT_MS);
  expect(
    slow.map((result) => `${result.url} as ${result.who}: ${result.times.join(", ")} ms`),
  ).toEqual([]);
  // developer-rules.md rule 12, "No query runs inside a loop": a list's statements do not grow
  // with its rows (the first page holds 25, the last fewer; the notifications' last page reads
  // twice, as a page past the end goes back to page 1).
  const growing = results
    .filter((result) => result.note === "first page")
    .flatMap((first) => {
      const last = results.find(
        (each) => each.note === "last page" && each.route === first.route && each.who === first.who,
      );
      return last?.statements != null &&
        first.statements != null &&
        (first.rows ?? 0) > (last.rows ?? 0) &&
        first.statements > last.statements
        ? [`${first.url} as ${first.who}: ${first.statements} against ${last.statements}`]
        : [];
    });
  expect(growing).toEqual([]);
  // 11-screens-and-ux.md rule 8 and developer-rules.md rule 12: lists are paged by the server.
  const unpaged = results.filter((result) => PAGED.has(result.route) && (result.rows ?? 0) > 25);
  expect(unpaged.map((result) => `${result.url}: ${result.rows} rows`)).toEqual([]);
});

function writeTable() {
  let refresh: { refreshMs: number; counts: Record<string, number> } | null = null;
  try {
    refresh = JSON.parse(readFileSync("test-results/speed-refresh.json", "utf8"));
  } catch {
    refresh = null;
  }
  const counts = refresh?.counts ?? {};
  const volume = [
    "orders",
    "order_events",
    "order_actions",
    "purchases",
    "stock_movements",
    "stock_documents",
    "money_rows",
    "notifications",
    "product_variants",
    "users",
  ]
    .filter((table) => counts[table] !== undefined)
    .map(
      (table) => `| \`${table}\` | ${counts[table]!.toLocaleString("en").replaceAll(",", " ")} |`,
    );
  const lines = results.map((result) => {
    const slowest = Math.max(...result.times);
    const median = [...result.times].sort((a, b) => a - b)[Math.floor(result.times.length / 2)]!;
    return `| \`${result.url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>")}\` | ${result.who ?? "signed out"} | ${result.note || ""} | ${median} | ${slowest} | ${result.statements ?? "not read"} | ${slowest < LIMIT_MS ? "yes" : "**no**"} |`;
  });
  // eslint-disable-next-line no-restricted-syntax -- the date of the measurement, not a business time
  const measuredOn = new Date().toISOString().slice(0, 10);
  const text = `# Speed

Build plan 9.2: every page measured at the volume of several school years (01-summary.md, Quality bar: "Any page opens in under 1 second"; edge-cases/developer-rules.md rule 12). Written by \`npm run speed\` (\`tests/speed/pages.spec.ts\`); do not edit the tables by hand.

## How it was measured

- ${measuredOn}, ${cpus().length} CPU threads (${cpus()[0]?.model ?? "unknown"}), ${Math.round(totalmem() / 1024 ** 3)} GiB memory; PostgreSQL 17 of \`docker-compose.yml\` on the same machine.
- A production build (\`next build\`, then \`next start\`) against \`procurement_speed\`, filled by \`tests/speed/fill.ts\`; the scheduler off.
- Chromium at 1440 × 900, one page at a time. Each address is opened once to warm up, then three times. A load runs from navigation start until the load event has ended and no loading area (\`aria-busy="true"\`) is left. Prefetch requests are aborted.
- Statements: those PostgreSQL logged between two marker statements around the last of the three loads, the page's sign-in check included.
- One analytics refresh on this volume took ${refresh ? `${(refresh.refreshMs / 1000).toFixed(1)} s` : "a time not read in this run"} (it runs every 5 minutes in the background; no page waits for it).

## Volume

| Table | Rows |
| --- | --- |
${volume.join("\n")}

## What task 9.2 changed

- Migration \`0049_speed_indexes.sql\`: every foreign key is led by an index of its own columns (13 single-column indexes became the composite of their key), and every filter column has its index or is read through the key of one (\`tests/indexes.db.test.ts\`).
- Eight Analytics totals read their whole summary table and filtered inside the sums; they now read only the rows of the two periods (\`where (now) or (then)\`). Finance's Analytics went from about 1 000 ms to about 400 ms.
- JIT is off on the app's connections: it spent about 270 of 310 ms of one Analytics count compiling.
- The Analytics drill-downs show 25 rows a page (rule 8), not 50.

## Queries in loops

No statement count grows with the rows of a page: a list's first page (25 rows) and its last page (fewer) send the same number. The notifications list is not a table; its 25 a page is proved by \`src/features/notifications/queries/my-notifications.db.test.ts\`.

## Pages

| Address | As | Note | Median ms | Slowest ms | Statements | Under 1 s |
| --- | --- | --- | --- | --- | --- | --- |
${lines.join("\n")}
`;
  // docs/ is never formatted (.prettierignore), so `prettier --check .` passes it as written.
  writeFileSync(TABLE, text);
}
