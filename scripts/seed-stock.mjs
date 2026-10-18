import { insertAuditRow } from "../src/server/audit-row.mjs";

// The demo warehouse documents of `npm run db:seed` (build-plan 5.12: "The seed gains an issue and
// a direct entry"; plan of 5.12, decided item 9). Every name is invented. The seed is plain
// JavaScript and cannot import src/domain/ (decisions 0.2), so it computes no formula (review of
// the plan, correction 2): each quantity, balance and average cost is written here as data. One
// direct entry from 0 makes the average its cost per unit, and an issue leaves the average as it
// is (09 Stock value); tests/seed.db.test.ts checks every value against nextBalance() and the
// numbers against documentNumber(). Each document has a fixed client key, by which a second run
// finds it and adds nothing.

/**
 * The Head's direct entry of stock CHL already had, then the Manager's issue of part of it to the
 * library. `balanceAfter` and `avgCost` are each line's stock and average after the document.
 */
export const SEED_STOCK = {
  branch: "CHL",
  directEntry: {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000101",
    actor: "seed_head",
    reason: "EXISTING_STOCK",
    lines: [
      { product: "Daftar", subtype: "48 varaq", qty: "100", unitCost: 4000n, balanceAfter: "100" },
      { product: "Qalam", subtype: null, qty: "200", unitCost: 1500n, balanceAfter: "200" },
    ],
  },
  issue: {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000102",
    actor: "seed_manager",
    department: "Kutubxona",
    receivedByName: "Sinov Kutubxonachi",
    lines: [
      { product: "Daftar", subtype: "48 varaq", qty: "20", unitCost: 4000n, balanceAfter: "80" },
      { product: "Qalam", subtype: null, qty: "30", unitCost: 1500n, balanceAfter: "170" },
    ],
  },
};

const MINUTE = 60_000;

/**
 * Writes the two documents as enterStockDirectly and issueStock write them: the number from the
 * branch's counter of the Tashkent year, the document, its lines, one movement per line, the
 * balance and, for the direct entry, its `direct_entry.create` audit row. Left out when either
 * document exists already, when the catalog lacks an item or the department, or when the branch
 * holds any of the items already (a hand-made stock would make the written balances wrong).
 */
export async function seedStock(query, { userIds, branchIds, moment }) {
  const found = await query(
    "select client_key from stock_documents where client_key = any($1::uuid[])",
    [[SEED_STOCK.directEntry.clientKey, SEED_STOCK.issue.clientKey]],
  );
  if (found.rows.length > 0) return;

  const branchId = branchIds.get(SEED_STOCK.branch);
  const variants = new Map();
  for (const line of SEED_STOCK.directEntry.lines) {
    const variant = await query(
      `select pv.id from product_variants pv join products p on p.id = pv.product_id
        where p.name = $1 and ($2::text is null and pv.is_default or pv.name = $2)`,
      [line.product, line.subtype],
    );
    if (!variant.rows[0]) return;
    variants.set(`${line.product}|${line.subtype}`, variant.rows[0].id);
  }
  const department = await query("select id from departments where branch_id = $1 and name = $2", [
    branchId,
    SEED_STOCK.issue.department,
  ]);
  if (!department.rows[0]) return;
  const held = await query(
    "select 1 from stock_balances where branch_id = $1 and variant_id = any($2::uuid[])",
    [branchId, [...variants.values()]],
  );
  if (held.rows.length > 0) return;

  const entryAt = new Date(moment.getTime() - 2 * MINUTE);
  const issueAt = new Date(moment.getTime() - MINUTE);
  const entry = await writeDocument(query, {
    type: "DIRECT_ENTRY",
    prefix: "ENT",
    movement: "DIRECT_ENTRY",
    sign: "",
    document: SEED_STOCK.directEntry,
    branchId,
    departmentId: null,
    reason: SEED_STOCK.directEntry.reason,
    receivedByName: null,
    actorId: userIds.get(SEED_STOCK.directEntry.actor),
    variants,
    at: entryAt,
    lineCost: true,
  });
  await insertAuditRow(query, {
    actorId: userIds.get(SEED_STOCK.directEntry.actor),
    action: "direct_entry.create",
    entity: "stock_documents",
    entityId: entry.id,
    before: null,
    after: {
      number: entry.number,
      branchId,
      branch: SEED_STOCK.branch,
      docDate: entry.docDate,
      reason: SEED_STOCK.directEntry.reason,
      comment: null,
      status: "POSTED",
      lines: SEED_STOCK.directEntry.lines.map((line) => ({
        variantId: variants.get(`${line.product}|${line.subtype}`),
        qty: line.qty,
        unitCost: line.unitCost.toString(),
      })),
    },
    at: entryAt,
  });
  await writeDocument(query, {
    type: "ISSUE",
    prefix: "ISS",
    movement: "ISSUE",
    sign: "-",
    document: SEED_STOCK.issue,
    branchId,
    departmentId: department.rows[0].id,
    reason: null,
    receivedByName: SEED_STOCK.issue.receivedByName,
    actorId: userIds.get(SEED_STOCK.issue.actor),
    variants,
    at: issueAt,
    lineCost: false,
  });
}

/** One POSTED document with its lines, movements and balances, at `at`. */
async function writeDocument(query, input) {
  const { document, branchId, at } = input;
  const counter = await query(
    `insert into number_counters (scope, branch_id, year, last_value, created_at)
     values ($1, $2, extract(year from $3::timestamptz at time zone 'Asia/Tashkent'), 1, $3)
     on conflict (scope, branch_id, year) do update
       set last_value = number_counters.last_value + 1
     returning last_value, year`,
    [input.prefix, branchId, at],
  );
  const { last_value: value, year } = counter.rows[0];
  const inserted = await query(
    `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
       doc_date, status, reason, client_key, created_by, created_at)
     values ($1 || '-' || $2 || '-' || lpad(($3::int % 100)::text, 2, '0') || '-'
         || lpad($4::text, greatest(4, length($4::text)), '0'),
       $5, $6, $7, $8, ($9::timestamptz at time zone 'Asia/Tashkent')::date, 'POSTED', $10, $11,
       $12, $9)
     returning id, number, doc_date::text as doc_date`,
    [
      input.prefix,
      SEED_STOCK.branch,
      year,
      value,
      input.type,
      branchId,
      input.departmentId,
      input.receivedByName,
      at,
      input.reason,
      document.clientKey,
      input.actorId,
    ],
  );
  const { id, number, doc_date: docDate } = inserted.rows[0];
  for (const line of document.lines) {
    const variantId = input.variants.get(`${line.product}|${line.subtype}`);
    const created = await query(
      `insert into stock_document_lines (document_id, variant_id, qty, unit_cost, created_at)
       values ($1, $2, $3::numeric, $4::bigint, $5) returning id`,
      [id, variantId, line.qty, input.lineCost ? line.unitCost.toString() : null, at],
    );
    await query(
      `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
         balance_after, document_line_id, created_by, created_at)
       values ($1, $2, $3, ($4 || $5)::numeric, $6::bigint, $7::numeric, $8, $9, $10)`,
      [
        branchId,
        variantId,
        input.movement,
        input.sign,
        line.qty,
        line.unitCost.toString(),
        line.balanceAfter,
        created.rows[0].id,
        input.actorId,
        at,
      ],
    );
    await query(
      `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
       values ($1, $2, $3::numeric, $4::bigint, $5, $5)
       on conflict (branch_id, variant_id) do update
         set qty = excluded.qty, avg_cost = excluded.avg_cost, updated_at = excluded.updated_at`,
      [branchId, variantId, line.balanceAfter, line.unitCost.toString(), at],
    );
  }
  return { id, number, docDate };
}

/**
 * The Manager's write-off of CHL waiting for the Head (build plan 6.2: the Head's home list
 * "write-offs to approve"; plan of 6.2, decided item 9): written as askWriteOff writes it, a
 * PENDING_APPROVAL document numbered from the branch's counter with its line, and no movement until
 * the Head approves (09 Write-off). askWriteOff writes no audit row. Left out when it exists, when
 * the catalog lacks the item, or when the branch holds less than its quantity.
 */
export const SEED_WRITE_OFF = {
  clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000103",
  actor: "seed_manager",
  reason: "DAMAGED",
  comment: "Suv tegib buzilgan (demo)",
  line: { product: "Daftar", subtype: "48 varaq", qty: "2" },
};

export async function seedWriteOff(query, { userIds, branchIds, moment }) {
  const found = await query("select 1 from stock_documents where client_key = $1", [
    SEED_WRITE_OFF.clientKey,
  ]);
  if (found.rows.length > 0) return;
  const branchId = branchIds.get(SEED_STOCK.branch);
  const { product, subtype, qty } = SEED_WRITE_OFF.line;
  const variant = await query(
    `select pv.id from product_variants pv join products p on p.id = pv.product_id
      where p.name = $1 and ($2::text is null and pv.is_default or pv.name = $2)`,
    [product, subtype],
  );
  if (!variant.rows[0]) return;
  const stock = await query(
    "select 1 from stock_balances where branch_id = $1 and variant_id = $2 and qty >= $3::numeric",
    [branchId, variant.rows[0].id, qty],
  );
  if (stock.rows.length === 0) return;

  const at = moment;
  const counter = await query(
    `insert into number_counters (scope, branch_id, year, last_value, created_at)
     values ('WOF', $1, extract(year from $2::timestamptz at time zone 'Asia/Tashkent'), 1, $2)
     on conflict (scope, branch_id, year) do update
       set last_value = number_counters.last_value + 1
     returning last_value, year`,
    [branchId, at],
  );
  const { last_value: value, year } = counter.rows[0];
  const inserted = await query(
    `insert into stock_documents (number, type, branch_id, doc_date, status, reason, comment,
       client_key, created_by, created_at)
     values ('WOF-' || $1 || '-' || lpad(($2::int % 100)::text, 2, '0') || '-'
         || lpad($3::text, greatest(4, length($3::text)), '0'),
       'WRITE_OFF', $4, ($5::timestamptz at time zone 'Asia/Tashkent')::date, 'PENDING_APPROVAL',
       $6, $7, $8, $9, $5)
     returning id`,
    [
      SEED_STOCK.branch,
      year,
      value,
      branchId,
      at,
      SEED_WRITE_OFF.reason,
      SEED_WRITE_OFF.comment,
      SEED_WRITE_OFF.clientKey,
      userIds.get(SEED_WRITE_OFF.actor),
    ],
  );
  await query(
    `insert into stock_document_lines (document_id, variant_id, qty, created_at)
     values ($1, $2, $3::numeric, $4)`,
    [inserted.rows[0].id, variant.rows[0].id, qty, at],
  );
}
