// The demo orders of `npm run db:seed` (build-plan 2.15: "The seed gains a few orders in different
// approval statuses, two of them in one group row"; plan of 2.15, decided item 5, Look first).
// Every name is invented. The seed is plain JavaScript and cannot import src/domain/, so it
// computes no formula: each total is written here as data, and tests/seed.db.test.ts checks every
// total, number, needed-by date and history event against the domain functions. Each order has a
// fixed client key, by which a second run finds it, in any year, and adds nothing.

/** One status move of the history, as the actions of 2.7, 2.10 and 2.11 write it. */
const SUBMIT = { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", actor: "seed_manager" };
const HEAD_APPROVES = {
  type: "APPROVE",
  from: "PENDING_HEAD",
  to: "PENDING_PRINCIPAL",
  actor: "seed_head",
};
const PRINCIPAL_APPROVES = {
  type: "APPROVE",
  from: "PENDING_PRINCIPAL",
  to: "PENDING_FINANCE",
  actor: "seed_principal",
};
const FINANCE_APPROVES = {
  type: "APPROVE",
  from: "PENDING_FINANCE",
  to: "PURCHASING",
  actor: "seed_finance",
};
const HEAD_SENDS_BACK = {
  type: "SEND_BACK",
  from: "PENDING_HEAD",
  to: "RETURNED",
  actor: "seed_head",
  reason: "Miqdorni kamaytiring (demo)",
};

/** The moves of a Finance approval with the cash it gives (08 When Finance approves; plan of 4.9). */
function approvedWithCash(prefix, cash) {
  return [
    { ...SUBMIT, key: `${prefix}1` },
    { ...HEAD_APPROVES, key: `${prefix}2` },
    { ...PRINCIPAL_APPROVES, key: `${prefix}3` },
    { ...FINANCE_APPROVES, key: `${prefix}4`, cash },
  ];
}

/**
 * The twelve orders, all owned by the seed Manager. `moves` are the history oldest first; orders
 * that name the same `submitKey` were submitted in one action, as were the two of the group row.
 * `total` is round(quantity × price) + extras (08-money-and-settlement.md, Planned total), checked
 * against orderTotal() by the seed test. `neededInDays` counts from the seed's Tashkent date. `daysAgo` moves the
 * whole history of an order that many days back, so its money has an age (build plan 4.9; plan of
 * 4.9, decided item 9). A move with `cash` gives that much at Finance's approval; `money` records
 * a money action as the Money tab does; `finish` marks the buying finished with a reason;
 * `purchase` records one Cash trip of today as recordPurchase does, with the order's actual total
 * and progress after it written as data (the seed computes no formula; the seed test checks them
 * against actualTotal() and the progress rule).
 */
export const SEED_ORDERS = [
  // The group row: one subtype at one status in CHL, two departments (05 Group rows).
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000001",
    branch: "CHL",
    product: "Ruchka",
    subtype: "Ko'k",
    department: "Oshxona",
    quantity: "20",
    price: 2500n,
    extras: [],
    total: 50000n,
    neededInDays: 14,
    moves: [{ ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000a1" }],
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000002",
    branch: "CHL",
    product: "Ruchka",
    subtype: "Ko'k",
    department: "Kutubxona",
    quantity: "10",
    price: 2500n,
    extras: [],
    total: 25000n,
    neededInDays: 14,
    moves: [{ ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000a1" }],
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000003",
    branch: "CHL",
    product: "Daftar",
    subtype: "48 varaq",
    department: "Kutubxona",
    quantity: "100",
    price: 4000n,
    extras: [],
    total: 400000n,
    neededInDays: 21,
    // Waiting for Principal for three days: stuck over 48 hours on the Head's home (build plan
    // 6.2; plan of 6.2, decided item 9).
    daysAgo: 3,
    moves: [
      { ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000b1" },
      { ...HEAD_APPROVES, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000b2" },
    ],
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000004",
    branch: "CHL",
    product: "Qalam",
    subtype: null,
    department: "IT xonasi",
    quantity: "50",
    price: 1500n,
    extras: [],
    total: 75000n,
    neededInDays: 10,
    moves: [
      { ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000c1" },
      { ...HEAD_APPROVES, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000c2" },
      { ...PRINCIPAL_APPROVES, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000c3" },
    ],
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000005",
    branch: "CHL",
    product: "Papka",
    subtype: null,
    department: "Xo'jalik bo'limi",
    quantity: "30",
    price: 5000n,
    extras: [{ type: "Yetkazib berish", amount: 20000n }],
    total: 170000n,
    neededInDays: 30,
    moves: [
      { ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000d1" },
      { ...HEAD_SENDS_BACK, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000d2" },
    ],
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000006",
    branch: "CHL",
    product: "Skotch",
    subtype: null,
    department: "Oshxona",
    quantity: "12",
    price: 6000n,
    extras: [],
    total: 72000n,
    neededInDays: 7,
    moves: [],
  },
  // YUN has no seed Principal (decisions 0.14, item 1): Waiting for Head is as far as it goes.
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000007",
    branch: "YUN",
    product: "Shtrix",
    subtype: null,
    department: "Sport zali",
    quantity: "8",
    price: 7000n,
    extras: [],
    total: 56000n,
    neededInDays: 14,
    moves: [{ ...SUBMIT, key: "0e5d7a4e-4a51-4c1e-9a10-0000000000e1" }],
  },
  // Money with managers (build plan 4.9): two Open orders holding the cash given at approval, on
  // two past days, and a Closed one whose cash came back in full.
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000008",
    branch: "CHL",
    product: "Qalam",
    subtype: null,
    department: "Kutubxona",
    quantity: "40",
    price: 1500n,
    extras: [],
    total: 60000n,
    neededInDays: 7,
    daysAgo: 3,
    moves: approvedWithCash("0e5d7a4e-4a51-4c1e-9a10-0000000000f", 60000n),
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000009",
    branch: "CHL",
    product: "Skotch",
    subtype: null,
    department: "IT xonasi",
    quantity: "10",
    price: 6000n,
    extras: [],
    total: 60000n,
    neededInDays: 7,
    daysAgo: 12,
    moves: approvedWithCash("0e5d7a4e-4a51-4c1e-9a10-0000000001a", 60000n),
  },
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000010",
    branch: "CHL",
    product: "Papka",
    subtype: null,
    department: "Xo'jalik bo'limi",
    quantity: "20",
    price: 5000n,
    extras: [],
    total: 100000n,
    neededInDays: 7,
    daysAgo: 20,
    moves: [
      ...approvedWithCash("0e5d7a4e-4a51-4c1e-9a10-0000000001b", 100000n),
      {
        type: "RECORD_MONEY",
        from: "PURCHASING",
        to: "PURCHASING",
        actor: "seed_finance",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001b5",
        money: { kind: "CASH_RETURNED", amount: 100000n, comment: "Pul qaytarildi (demo)" },
      },
      {
        type: "MARK_NOT_BOUGHT",
        from: "PURCHASING",
        to: "PURCHASING",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001b6",
        reason: "Do'konda topilmadi (demo)",
        finish: "NOT_BOUGHT",
      },
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001b7",
      },
      {
        type: "CLOSE",
        from: "SETTLEMENT",
        to: "CLOSED",
        actor: "seed_finance",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001b8",
      },
    ],
  },
  // Waiting for settlement (build plan 6.2: Finance's settlement entries and the Head's
  // overspends). The Manager holds the 60 000 given: not bought, so Receive 60 000.
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000011",
    branch: "CHL",
    product: "Daftar",
    subtype: "48 varaq",
    department: "Oshxona",
    quantity: "15",
    price: 4000n,
    extras: [],
    total: 60000n,
    neededInDays: 7,
    moves: [
      ...approvedWithCash("0e5d7a4e-4a51-4c1e-9a10-0000000001c", 60000n),
      {
        type: "MARK_NOT_BOUGHT",
        from: "PURCHASING",
        to: "PURCHASING",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001c5",
        reason: "Do'konda topilmadi (demo)",
        finish: "NOT_BOUGHT",
      },
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001c6",
      },
    ],
  },
  // A service bought for 250 000 in cash against a plan of 100 000 with 100 000 given: the school
  // owes the Manager 150 000 (Pay), and it is 150 000 and 150 % over, above the guard, waiting for
  // the Head's acknowledgment (08 Overspend guard). A service moves no stock.
  {
    clientKey: "0e5d7a4e-4a51-4c1e-9a10-000000000012",
    branch: "CHL",
    product: "Santexnika ta'miri",
    subtype: null,
    department: "Xo'jalik bo'limi",
    quantity: "1",
    price: 100000n,
    extras: [],
    total: 100000n,
    neededInDays: 7,
    moves: [
      ...approvedWithCash("0e5d7a4e-4a51-4c1e-9a10-0000000001d", 100000n),
      {
        type: "RECORD_PURCHASE",
        from: "PURCHASING",
        to: "PURCHASING",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001d5",
        purchase: {
          tripKey: "0e5d7a4e-4a51-4c1e-9a10-0000000001d9",
          qty: "1",
          unitPrice: 250000n,
          actualTotal: 250000n,
          progress: "DONE",
        },
      },
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        actor: "seed_manager",
        key: "0e5d7a4e-4a51-4c1e-9a10-0000000001d6",
      },
    ],
  },
];

/** One hour between two moves, the last one an hour before the seed moment, so they sort. */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The seed moment moved `daysAgo` days back: the end of the order's history. */
const endOf = (order, moment) => moment.getTime() - (order.daysAgo ?? 0) * DAY;

/**
 * Writes the seed orders that are not there yet, in the seed's transaction. A found client key
 * keeps its order as it is.
 * @param {(text: string, values?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {{ userIds: Map<string, string>, branchIds: Map<string, string>, moment: Date }} context
 */
export async function seedOrders(query, { userIds, branchIds, moment }) {
  const found = await query("select client_key from orders where client_key = any($1::uuid[])", [
    SEED_ORDERS.map((order) => order.clientKey),
  ]);
  const kept = new Set(found.rows.map((row) => row.client_key));
  const missing = SEED_ORDERS.filter((order) => !kept.has(order.clientKey));
  if (missing.length === 0) return;

  const managerId = userIds.get("seed_manager");
  const ids = new Map();
  for (const order of missing) {
    const branchId = branchIds.get(order.branch);
    const variant = await query(
      `select pv.id from product_variants pv join products p on p.id = pv.product_id
        where p.name = $1 and ($2::text is null and pv.is_default or pv.name = $2)`,
      [order.product, order.subtype],
    );
    const department = await query(
      "select id from departments where branch_id = $1 and name = $2",
      [branchId, order.department],
    );
    // A catalog the Head made by hand before the seed may lack the listed product, subtype or
    // department: that order is left out, and the seed goes on (as the catalogs keep found rows).
    if (!variant.rows[0] || !department.rows[0]) continue;
    const status = order.moves.at(-1)?.to ?? "DRAFT";
    const created = new Date(endOf(order, moment) - (order.moves.length + 1) * HOUR);
    // Inserted as a DRAFT and moved to its status last: the plan, its extras and its number are
    // written while the order is editable (orders_guard; order_extras_guard of 0019).
    const inserted = await query(
      `insert into orders (branch_id, owner_id, created_by, status, variant_id, department_id,
         needed_by, planned_qty, planned_price, planned_total, payment_type, client_key,
         created_at, updated_at)
       values ($1, $2, $2, 'DRAFT', $3, $4,
         (($5::timestamptz at time zone 'Asia/Tashkent')::date + $6::int), $7::numeric, $8::bigint,
         $9::bigint, 'CASH', $10, $11, $11)
       returning id`,
      [
        branchId,
        managerId,
        variant.rows[0].id,
        department.rows[0].id,
        moment,
        order.neededInDays,
        order.quantity,
        order.price,
        order.total,
        order.clientKey,
        created,
      ],
    );
    const id = inserted.rows[0].id;
    ids.set(order.clientKey, id);
    for (const extra of order.extras) {
      await query(
        `insert into order_extras (order_id, extra_cost_type_id, amount, created_at)
         select $1, id, $2::bigint, $3 from extra_cost_types where name = $4`,
        [id, extra.amount, created, extra.type],
      );
    }
    if (order.moves.length === 0) continue;

    // The number at the first submit (05 Order number): the branch's next counter value of the
    // Tashkent year of the submit, as 2.7's submit takes it.
    const submitted = new Date(endOf(order, moment) - order.moves.length * HOUR);
    const counter = await query(
      `insert into number_counters (scope, branch_id, year, last_value, created_at)
       values ('ORD', $1, extract(year from $2::timestamptz at time zone 'Asia/Tashkent'), 1, $2)
       on conflict (scope, branch_id, year) do update
         set last_value = number_counters.last_value + 1
       returning last_value, year`,
      [branchId, submitted],
    );
    const { last_value: value, year } = counter.rows[0];
    await query(
      `update orders set
         number = $2 || '-' || lpad(($3::int % 100)::text, 2, '0') || '-' || lpad($4::text, greatest(4, length($4::text)), '0'),
         submitted_at = $5,
         stock_at_submit = coalesce((select sb.qty from stock_balances sb
           where sb.branch_id = orders.branch_id and sb.variant_id = orders.variant_id), 0)
       where id = $1`,
      [id, order.branch, year, value, submitted],
    );
    // The copy of the plan at the submit (14-data-model.md, order_revisions), as writeSnapshots()
    // of submit-steps.ts writes it; the seed test compares the two.
    await query(
      `insert into order_revisions (order_id, revision, submission, snapshot, created_at)
       select o.id, o.revision, 1, jsonb_build_object(
         'number', o.number,
         'branchId', o.branch_id,
         'variantId', o.variant_id,
         'companyId', o.company_id,
         'departmentId', o.department_id,
         'requesterName', o.requester_name,
         'neededBy', o.needed_by,
         'quantity', o.planned_qty::text,
         'price', o.planned_price::text,
         'extras', coalesce((
           select jsonb_agg(jsonb_build_object(
             'extraCostTypeId', e.extra_cost_type_id, 'amount', e.amount::text
           ) order by e.created_at, e.id)
           from order_extras e where e.order_id = o.id), '[]'::jsonb),
         'plannedTotal', o.planned_total::text,
         'paymentType', o.payment_type,
         'priority', o.priority,
         'urgentReason', o.urgent_reason,
         'comment', o.comment,
         'referencePhotoFileId', o.reference_photo_file_id,
         'stockAtSubmit', o.stock_at_submit::text
       ), $2
       from orders o where o.id = $1`,
      [id, submitted],
    );
    await query("update orders set status = $2 where id = $1", [id, status]);
  }

  // The history: one order_actions row per action, one event per order, oldest first.
  const actions = new Map();
  for (const order of missing) {
    if (!ids.has(order.clientKey)) continue;
    order.moves.forEach((move, at) => {
      const action = actions.get(move.key) ?? { move, when: Infinity, orders: [] };
      action.orders.push(ids.get(order.clientKey));
      actions.set(move.key, action);
      action.when = Math.min(action.when, endOf(order, moment) - (order.moves.length - at) * HOUR);
    });
  }
  for (const [key, { move, when: time, orders }] of actions) {
    const when = new Date(time);
    const actorId = userIds.get(move.actor);
    const action = await query(
      `insert into order_actions (client_key, type, actor_id, reason, order_count, created_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [key, move.type, actorId, move.reason ?? null, orders.length, when],
    );
    const actionId = action.rows[0].id;
    for (const orderId of orders) {
      const payload = await seedOrderWrite(query, {
        move,
        orderId,
        actionId,
        actorId,
        when,
        moment,
      });
      await query(
        `insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
           comment, payload, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId,
          actionId,
          move.type,
          move.from,
          move.to,
          actorId,
          move.reason ?? null,
          payload === null ? null : JSON.stringify(payload),
          when,
        ],
      );
    }
  }
}

/**
 * What a move writes beside its history, as its action does (plan of 4.9, decided item 9): the
 * cash of Finance's approval (approve.ts giveCash: one money action naming the approval, dated
 * that day in Tashkent, no comment) and `approved_at`; a money action of the Money tab
 * (record-money.ts); the buying finished with its reason (finish-buying.ts); `closed_at` of
 * Finance's Close (close.ts); a purchase record (record-purchase.ts). Returns the event's payload,
 * or null.
 */
async function seedOrderWrite(query, { move, orderId, actionId, actorId, when, moment }) {
  const money = async (kind, amount, comment) => {
    const owner = await query("select owner_id from orders where id = $1", [orderId]);
    const inserted = await query(
      `insert into money_actions (client_key, order_action_id, manager_id, occurred_on, comment,
         created_by, created_at)
       values ($1, $2, $3, ($4::timestamptz at time zone 'Asia/Tashkent')::date, $5, $6, $4)
       returning id`,
      [move.key, actionId, owner.rows[0].owner_id, when, comment, actorId],
    );
    await query(
      `insert into money_rows (money_action_id, order_id, kind, amount, created_at)
       values ($1, $2, $3, $4::bigint, $5)`,
      [inserted.rows[0].id, orderId, kind, amount, when],
    );
    return inserted.rows[0].id;
  };
  if (move.cash) {
    await money("CASH_GIVEN", move.cash, null);
    await query("update orders set approved_at = $2 where id = $1", [orderId, when]);
    return null;
  }
  if (move.money) {
    const id = await money(move.money.kind, move.money.amount, move.money.comment);
    return { money: { actionId: id, kind: move.money.kind, amount: move.money.amount.toString() } };
  }
  if (move.finish) {
    await query("update orders set progress = $2, finish_reason = $3 where id = $1", [
      orderId,
      move.finish,
      move.reason,
    ]);
    return { progress: { from: "OPEN", to: move.finish } };
  }
  if (move.purchase) {
    // The trip is of the seed's Tashkent today, so the record counts in "spending this month"
    // whatever day the seed runs (review of the plan of 6.2, correction 1).
    const { tripKey, qty, unitPrice, actualTotal, progress } = move.purchase;
    const trip = await query(
      `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type, created_by,
         created_at)
       select $1, branch_id, ($2::timestamptz at time zone 'Asia/Tashkent')::date, 'CASH', $3, $4
       from orders where id = $5
       returning id`,
      [tripKey, moment, actorId, when, orderId],
    );
    const record = await query(
      `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
         created_by, created_at)
       select $1, id, branch_id, variant_id, $2::numeric, $3::bigint, $4, $5 from orders
       where id = $6
       returning id, variant_id`,
      [trip.rows[0].id, qty, unitPrice, actorId, when, orderId],
    );
    await query("update orders set actual_total = $2::bigint, progress = $3 where id = $1", [
      orderId,
      actualTotal,
      progress,
    ]);
    return {
      purchase: {
        id: record.rows[0].id,
        variantId: record.rows[0].variant_id,
        qty,
        unitPrice: unitPrice.toString(),
      },
    };
  }
  if (move.type === "CLOSE") {
    await query("update orders set closed_at = $2 where id = $1", [orderId, when]);
  }
  return null;
}
