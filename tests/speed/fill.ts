import { randomUUID } from "node:crypto";

import { businessDate, businessYear } from "@/domain/business-date";
import {
  type CashRecord,
  type MoneyRow,
  type MoneyRowKind,
  approvalCashRows,
  isExactMatch,
  orderCashCount,
  plannedCashOf,
  settlementCashRows,
  settlementRows,
} from "@/domain/money-ledger";
import { orderNumber } from "@/domain/order-numbers";
import { type OrderPlan, orderTotal } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import { type OrderProgress, actualTotal, progressAfterBuying } from "@/domain/purchases";
import type { RequestStatus } from "@/domain/request-status";
import { type MovementType, type StockBalance, nextBalance } from "@/domain/stock";
import { type DocumentType, documentNumber } from "@/domain/stock-documents";

import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";

// The volume of build-plan 9.2 ("a script fills a database with several years of invented orders,
// purchases and movements"; plan of 9.2, What will exist 2). Every name is invented. Rows are
// written in batches with the values the actions write (plan of 9.2, decided item 8): the
// numbers come from src/domain/ (orderTotal(), actualTotal(), the money ledger, nextBalance()),
// never from a second formula (CLAUDE.md rule 1); rows are only inserted (rule 7). The choices
// come from one seeded generator, so two fills of the same sizes write the same counts.

/** The sizes of a fill (plan of 9.2, decided item 2, Look first). */
export type FillSizes = {
  /** School years back from the moment of the fill. */
  years: number;
  branches: number;
  ordersPerBranchYear: number;
  /** Products with real subtypes; as many again have one hidden default subtype. */
  productsWithSubtypes: number;
  subtypesPerProduct: number;
  departmentsPerBranch: number;
  managers: number;
};

/** The speed run's volume: three school years, 36 000 orders (decided item 2). */
export const SPEED_SIZES: FillSizes = {
  years: 3,
  branches: 4,
  ordersPerBranchYear: 3000,
  productsWithSubtypes: 400,
  subtypesPerProduct: 4,
  departmentsPerBranch: 12,
  managers: 21,
};

/** The invented password of every person of the speed database (decided item 10). */
export const SPEED_PASSWORD = "invented-speed-password";

/** The people the measurement signs in as (plan of 9.2, What will exist 3). */
export const SPEED_PEOPLE = {
  head: "speed_head",
  manager: "speed_manager_01",
  principal: "speed_principal_1",
  finance: "speed_finance_1",
} as const;

type Query = (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Tashkent is UTC+5 all year: a fixture's wall-clock hours, never a business date's formula. */
const TASHKENT = 5 * HOUR;

/** mulberry32: a small seeded generator, so a fill is the same every time. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    chance: (share: number) => next() < share,
  };
}

/** A moment at an hour of the Tashkent day `days` after the Tashkent day of `from`. */
function dayAt(from: number, days: number, hour: number): number {
  const day = Math.floor((from + TASHKENT) / DAY) + days;
  return day * DAY - TASHKENT + hour * HOUR;
}

type Row = Record<string, unknown>;

/** Rows by table, inserted in the order they were added (so `seq` follows time). */
class Rows {
  readonly tables = new Map<string, Row[]>();
  add(table: string, row: Row) {
    let rows = this.tables.get(table);
    if (rows === undefined) this.tables.set(table, (rows = []));
    rows.push(row);
  }
  count(table: string) {
    return this.tables.get(table)?.length ?? 0;
  }
}

const json = (value: unknown) =>
  JSON.stringify(value, (_key, each) => (typeof each === "bigint" ? each.toString() : each));

/** Inserts the rows of one table in batches; columns are those of the first row. */
async function insertAll(query: Query, table: string, rows: readonly Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  const list = columns.map((column) => `"${column}"`).join(", ");
  for (let at = 0; at < rows.length; at += 2000) {
    const batch = rows.slice(at, at + 2000).map((row) => {
      const out: Row = {};
      for (const column of columns) {
        const value = row[column];
        out[column] = value instanceof Date ? value.toISOString() : value;
      }
      return out;
    });
    await query(
      `insert into "${table}" (${list})
       select ${list} from json_populate_recordset(null::"${table}", $1::json) with ordinality
       order by ordinality`,
      [json(batch)],
    );
  }
}

type Person = { id: string; name: string; role: "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE" };
type Branch = { id: string; code: string; principal: Person; departments: string[] };
type Variant = { id: string; productId: string; goods: boolean; price: bigint; decimal: boolean };

type Plan = {
  id: string;
  branch: Branch;
  owner: Person;
  variant: Variant;
  department: string;
  plan: OrderPlan;
  total: bigint;
  created: number;
  extraType: string | null;
};

/** One status move or record of an order's history, as its action writes it. */
type Move = {
  type: string;
  from: RequestStatus;
  to: RequestStatus;
  at: number;
  actor: Person;
  /** Orders of one action share its key. */
  group: string;
  reason?: string;
  payload?: Row;
  cash?: { kind: MoneyRowKind; amount: bigint };
};

export type FillCounts = Record<string, number>;

/**
 * Fills an empty, migrated database with `sizes` of invented data up to `moment`. Runs inside the
 * caller's transaction (the deferred catalog triggers check at its commit).
 */
export async function fill(query: Query, moment: Date, sizes: FillSizes): Promise<FillCounts> {
  const random = generator(9_2);
  const end = moment.getTime();
  const start = end - sizes.years * 365 * DAY;
  const at = (ms: number) => new Date(ms);
  const rows = new Rows();
  const audit = (actor: Person, action: string, entity: string, id: string, when: number) =>
    rows.add("audit_log", {
      id: randomUUID(),
      actor_id: actor.id,
      action,
      entity,
      entity_id: id,
      before: null,
      after: { invented: true },
      created_at: at(when),
    });

  // People: the Head first, then a Principal per branch, Finance, Managers (A8; 03 Roles).
  const person = async (
    username: string,
    fullName: string,
    role: Person["role"],
    index: number,
  ): Promise<Person> => {
    const phone = `+998 90 ${String(100 + Math.floor(index / 100)).slice(-3)} ${String(index % 100).padStart(2, "0")} 92`;
    const { id } = await insertPasswordUser(
      query,
      { username, fullName, phone, role },
      SPEED_PASSWORD,
      at(start - DAY),
    );
    return { id, name: fullName, role };
  };
  const head = await person(SPEED_PEOPLE.head, "Tezlik Bosh", "HEAD", 1);
  const branches: Branch[] = [];
  for (let b = 0; b < sizes.branches; b += 1) {
    const code = `S${String.fromCharCode(65 + b)}`;
    const id = randomUUID();
    rows.add("branches", {
      id,
      name: `Tezlik filiali ${code}`,
      code,
      address: `Sinov ko'chasi ${b + 1}`,
      is_active: true,
      created_at: at(start - DAY),
      client_key: null,
    });
    const principal = await person(
      `speed_principal_${b + 1}`,
      `Tezlik Direktor ${b + 1}`,
      "PRINCIPAL",
      10 + b,
    );
    const departments: string[] = [];
    for (let d = 0; d < sizes.departmentsPerBranch; d += 1) {
      const department = randomUUID();
      departments.push(department);
      rows.add("departments", {
        id: department,
        branch_id: id,
        name: `Bo'lim ${d + 1}`,
        responsible_name: `Mas'ul ${code}-${d + 1}`,
        responsible_phone: null,
        is_active: true,
        client_key: null,
        created_at: at(start - DAY),
      });
    }
    branches.push({ id, code, principal, departments });
  }
  await insertAll(query, "branches", rows.tables.get("branches") ?? []);
  rows.tables.delete("branches");
  const membership = (user: Person, branch: Branch) =>
    rows.add("user_branches", {
      user_id: user.id,
      branch_id: branch.id,
      user_role: user.role,
      user_is_active: true,
      created_at: at(start - DAY),
    });
  for (const branch of branches) membership(branch.principal, branch);
  const finance: Person[] = [];
  for (let f = 0; f < Math.max(1, sizes.branches); f += 1) {
    const one = await person(`speed_finance_${f + 1}`, `Tezlik Moliya ${f + 1}`, "FINANCE", 20 + f);
    finance.push(one);
    // The first Finance has every branch; each other one branch.
    for (const branch of f === 0 ? branches : [branches[f]!]) membership(one, branch);
  }
  const managers = new Map<string, Person[]>(branches.map((branch) => [branch.id, []]));
  for (let m = 0; m < sizes.managers; m += 1) {
    const one = await person(
      `speed_manager_${String(m + 1).padStart(2, "0")}`,
      `Tezlik Menejer ${m + 1}`,
      "MANAGER",
      30 + m,
    );
    // The first Manager has two branches, as the seed's Manager (11 Branch switcher).
    const own = m === 0 ? branches.slice(0, 2) : [branches[m % branches.length]!];
    for (const branch of own) {
      membership(one, branch);
      managers.get(branch.id)!.push(one);
    }
  }
  const financeOf = (branch: Branch) =>
    finance.find((one, f) => f > 0 && branches[f] === branch) ?? finance[0]!;

  // Catalogs (04): units, categories, companies, extra cost types, products and subtypes with
  // their reference prices and the history that records them (price_recorded).
  const catalogRow = (table: string, row: Row) => {
    const id = randomUUID();
    rows.add(table, { id, ...row, is_active: true, client_key: null, created_at: at(start - DAY) });
    return id;
  };
  const pieces = catalogRow("units", { name: "Dona", short_name: "dona", allow_decimal: false });
  const kilos = catalogRow("units", { name: "Kilogramm", short_name: "kg", allow_decimal: true });
  const categories = Array.from({ length: 20 }, (_, c) =>
    catalogRow("categories", { name: `Toifa ${c + 1}` }),
  );
  const suppliers = Array.from({ length: 40 }, (_, c) =>
    catalogRow("companies", {
      name: `Ta'minotchi ${c + 1}`,
      kind: "SUPPLIER",
      tax_id: null,
      phone: null,
      note: null,
    }),
  );
  const extraTypes = ["Yetkazish", "O'rnatish", "Qadoq"].map((name) =>
    catalogRow("extra_cost_types", { name }),
  );
  const variants: Variant[] = [];
  const products = sizes.productsWithSubtypes * 2;
  for (let p = 0; p < products; p += 1) {
    const productId = randomUUID();
    const withSubtypes = p < sizes.productsWithSubtypes;
    const goods = p % 10 !== 9;
    const decimal = goods && p % 7 === 3;
    rows.add("products", {
      id: productId,
      name: `Mahsulot ${p + 1}`,
      type: goods ? "GOODS" : "SERVICE",
      category_id: categories[p % categories.length],
      unit_id: decimal ? kilos : pieces,
      photo_file_id: null,
      default_company_id: null,
      reference_price: null,
      description: null,
      is_active: true,
      client_key: null,
      created_at: at(start - DAY),
      has_variants: withSubtypes,
    });
    audit(head, "product.create", "product", productId, start - DAY);
    const names = withSubtypes
      ? Array.from({ length: sizes.subtypesPerProduct }, (_, s) => `Tur ${s + 1}`)
      : ["default"];
    for (const name of names) {
      const id = randomUUID();
      const price = BigInt(random.int(5, 400) * 500);
      rows.add("product_variants", {
        id,
        product_id: productId,
        name,
        is_default: !withSubtypes,
        photo_file_id: null,
        reference_price: price,
        last_purchase_price: null,
        last_purchase_at: null,
        is_active: true,
        client_key: null,
        created_at: at(start - DAY),
      });
      rows.add("price_history", {
        id: randomUUID(),
        variant_id: id,
        price,
        source: "HEAD",
        note: null,
        set_by: head.id,
        purchase_id: null,
        client_key: null,
        created_at: at(start - DAY),
      });
      variants.push({ id, productId, goods, price, decimal });
    }
  }

  // Product suggestions of the Managers (04 Product suggestions), most of them decided.
  for (const branch of branches) {
    for (let n = 0; n < 30; n += 1) {
      const when = start + Math.floor(random.next() * (end - start));
      const decided = n >= 5;
      rows.add("catalog_suggestions", {
        id: randomUUID(),
        branch_id: branch.id,
        suggested_by: random.pick(managers.get(branch.id)!).id,
        name: `Taklif ${branch.code}-${n + 1}`,
        unit_text: "dona",
        photo_file_id: null,
        note: null,
        status: decided ? "DECLINED" : "PENDING",
        decided_by: decided ? head.id : null,
        decided_at: decided ? at(when + DAY) : null,
        decision_note: decided ? "Katalogda bor" : null,
        product_id: null,
        client_key: randomUUID(),
        created_at: at(when),
      });
    }
  }

  // The orders (05): spread over the years per branch, each with its plan and total.
  const plans: Plan[] = [];
  for (const branch of branches) {
    const count = sizes.ordersPerBranchYear * sizes.years;
    for (let o = 0; o < count; o += 1) {
      const variant = random.pick(variants);
      const quantity = variant.decimal
        ? `${random.int(1, 40)}.${random.int(0, 9)}`
        : String(random.int(1, 60));
      const price = variant.price;
      const extraType = random.chance(0.08) ? random.pick(extraTypes) : null;
      const extras = extraType ? [BigInt(random.int(1, 40) * 1000)] : [];
      const paymentType: PaymentType = random.chance(0.75)
        ? "CASH"
        : random.chance(0.7)
          ? "TRANSFER"
          : "CARD";
      const plan: OrderPlan = { quantity, price, extras, paymentType };
      plans.push({
        id: randomUUID(),
        branch,
        owner: random.pick(managers.get(branch.id)!),
        variant,
        department: random.pick(branch.departments),
        plan,
        total: orderTotal(plan),
        created: start + Math.floor(random.next() * (end - start - 2 * HOUR)),
        extraType,
      });
    }
  }
  plans.sort((a, b) => a.created - b.created);

  // Each order's history (06 Allowed moves), quantised to working days so one approver's action
  // ticks many orders (06: "each ticking many orders at once").
  type Story = {
    moves: Move[];
    status: RequestStatus;
    submitted: number | null;
    purchase: {
      at: number;
      qty: string;
      unitPrice: bigint;
      extra: bigint | null;
      variant: Variant;
    } | null;
    progress: OrderProgress;
    finishReason: string | null;
    approvedAt: number | null;
    closedAt: number | null;
  };
  const stories = new Map<string, Story>();
  for (const order of plans) {
    const story: Story = {
      moves: [],
      status: "DRAFT",
      submitted: null,
      purchase: null,
      progress: "OPEN",
      finishReason: null,
      approvedAt: null,
      closedAt: null,
    };
    stories.set(order.id, story);
    const step = (
      move: Omit<Move, "from" | "to" | "group"> & { group?: string },
      to: RequestStatus,
    ): boolean => {
      if (move.at >= end) return false;
      story.moves.push({
        ...move,
        to,
        from: story.status,
        group: move.group ?? `${order.branch.id}|${move.type}|${move.actor.id}|${move.at}`,
      });
      story.status = to;
      return true;
    };
    // A few of the last month's orders are still drafts (05 Drafts).
    if (order.created > end - 30 * DAY && random.chance(0.05)) continue;
    const submit = order.created + random.int(1, 3) * HOUR;
    if (!step({ type: "SUBMIT", at: submit, actor: order.owner }, "PENDING_HEAD")) continue;
    story.submitted = submit;
    let day = 0;
    const next = (min: number, max: number, hour: number) => {
      day += random.int(min, max);
      return dayAt(submit, day, hour);
    };
    // About 3% are cancelled by their owner while they wait (06: Cancel).
    if (random.chance(0.03)) {
      step(
        { type: "CANCEL", at: next(0, 1, 18), actor: order.owner, reason: "Kerak emas" },
        "CANCELLED",
      );
      continue;
    }
    // About 4% are sent back once by the Head and submitted again (06: Send back).
    if (random.chance(0.04)) {
      const back = {
        type: "SEND_BACK",
        at: next(1, 2, 10),
        actor: head,
        reason: "Miqdorni tekshiring",
      };
      if (!step(back, "RETURNED")) continue;
      if (!step({ type: "SUBMIT_AGAIN", at: next(0, 2, 16), actor: order.owner }, "PENDING_HEAD")) {
        continue;
      }
    }
    const reject = random.chance(0.04) ? random.int(1, 3) : 0;
    const approvers = [head, order.branch.principal, financeOf(order.branch)];
    const after: RequestStatus[] = ["PENDING_PRINCIPAL", "PENDING_FINANCE", "PURCHASING"];
    let stopped = false;
    for (let s = 0; s < 3 && !stopped; s += 1) {
      const when = next(1, 2, 10 + s * 2);
      if (reject === s + 1) {
        step(
          { type: "REJECT", at: when, actor: approvers[s]!, reason: "Byudjet yetmaydi" },
          "REJECTED",
        );
        stopped = true;
        break;
      }
      const cash = s === 2 ? plannedCashOf(order.plan.paymentType, order.total) : 0n;
      if (
        !step(
          {
            type: "APPROVE",
            at: when,
            actor: approvers[s]!,
            ...(cash > 0n ? { cash: { kind: "CASH_GIVEN" as const, amount: cash } } : {}),
          },
          after[s]!,
        )
      ) {
        stopped = true;
      } else if (s === 2) {
        story.approvedAt = when;
      }
    }
    if (stopped || story.status !== "PURCHASING") continue;

    // Buying (07): 2% not bought; otherwise one record at about the planned price.
    const buyAt = next(1, 6, 15);
    if (buyAt >= end) continue;
    const records: CashRecord[] = [];
    if (random.chance(0.02)) {
      step(
        {
          type: "MARK_NOT_BOUGHT",
          at: buyAt,
          actor: order.owner,
          reason: "Bozorda topilmadi",
          payload: { progress: { from: "OPEN", to: "NOT_BOUGHT" } },
        },
        "PURCHASING",
      );
      story.progress = "NOT_BOUGHT";
      story.finishReason = "Bozorda topilmadi";
    } else {
      const shift = random.chance(0.6) ? 0 : random.int(-8, 8);
      const unitPrice = (order.plan.price * BigInt(100 + shift)) / 100n;
      const qty = order.plan.quantity;
      const extra = order.extraType ? order.plan.extras[0]! : null;
      const paymentType = order.plan.paymentType;
      const record: CashRecord = {
        variantId: order.variant.id,
        qty,
        unitPrice,
        paymentType,
        extras: extra === null ? [] : [{ amount: extra, paymentType }],
        isCancelled: false,
      };
      records.push(record);
      story.purchase = { at: buyAt, qty, unitPrice, extra, variant: order.variant };
      story.progress = progressAfterBuying("OPEN", order.plan.quantity, qty);
      step({ type: "RECORD_PURCHASE", at: buyAt, actor: order.owner, group: "" }, "PURCHASING");
    }

    // Closing (08): an exact match closes at once; otherwise settlement, then Close.
    const given: MoneyRow[] =
      story.moves.find((move) => move.cash)?.cash === undefined
        ? []
        : [
            {
              kind: "CASH_GIVEN",
              amount: story.moves.find((move) => move.cash)!.cash!.amount,
              isCancelled: false,
            },
          ];
    const count = orderCashCount(given, records);
    const exact = isExactMatch({
      status: "PURCHASING",
      progress: story.progress,
      variantId: order.variant.id,
      plan: order.plan,
      records,
      cashCount: count,
    });
    const closeAt = next(1, 4, 17);
    const fin = financeOf(order.branch);
    if (exact) {
      if (step({ type: "CLOSE_EXACT", at: closeAt, actor: order.owner }, "CLOSED")) {
        story.closedAt = closeAt;
      }
      continue;
    }
    if (!step({ type: "SEND_TO_SETTLEMENT", at: closeAt, actor: order.owner }, "SETTLEMENT"))
      continue;
    const settleAt = next(1, 3, 11);
    const [row] = settlementRows([{ id: order.id, cashCount: count }]);
    if (row !== undefined) {
      if (
        !step(
          {
            type: "SETTLE_CASH",
            at: settleAt,
            actor: fin,
            cash: { kind: row.kind, amount: row.amount },
          },
          "SETTLEMENT",
        )
      ) {
        continue;
      }
    } else if (order.plan.paymentType !== "CASH") {
      if (!step({ type: "CONFIRM_SETTLEMENT", at: settleAt, actor: fin }, "SETTLEMENT")) continue;
    }
    const finalAt = settleAt + HOUR;
    if (step({ type: "CLOSE", at: finalAt, actor: fin }, "CLOSED")) story.closedAt = finalAt;
  }

  // The order rows, numbered at their first submit (05 Order number), as drafts first: their
  // extras are written while the plan is open (order_extras_guard), then their statuses.
  const counters = new Map<string, number>();
  const numberOf = (branch: Branch, submitted: number) => {
    const year = businessYear(at(submitted));
    const key = `${branch.id}|${year}`;
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return orderNumber(branch.code, year, value);
  };
  for (const order of plans) {
    const story = stories.get(order.id)!;
    const last = story.moves.at(-1)?.at ?? order.created;
    rows.add("orders", {
      id: order.id,
      number: story.submitted === null ? null : numberOf(order.branch, story.submitted),
      revision: 1,
      branch_id: order.branch.id,
      owner_id: order.owner.id,
      status: "DRAFT",
      priority: "NORMAL",
      urgent_reason: null,
      version: story.moves.length + 1,
      variant_id: order.variant.id,
      company_id: null,
      department_id: order.department,
      requester_name: null,
      needed_by: businessDate(at(dayAt(order.created, random.int(7, 30), 12))),
      planned_qty: order.plan.quantity,
      planned_price: order.plan.price,
      payment_type: order.plan.paymentType,
      comment: null,
      reference_photo_file_id: null,
      stock_at_submit: story.submitted === null ? null : "0",
      progress: "OPEN",
      finish_reason: null,
      planned_total: order.total,
      actual_total: null,
      submitted_at: story.submitted === null ? null : at(story.submitted),
      approved_at: story.approvedAt === null ? null : at(story.approvedAt),
      closed_at: story.closedAt === null ? null : at(story.closedAt),
      client_key: randomUUID(),
      created_by: order.owner.id,
      created_at: at(order.created),
      updated_at: at(last),
    });
    if (order.extraType) {
      rows.add("order_extras", {
        id: randomUUID(),
        order_id: order.id,
        extra_cost_type_id: order.extraType,
        amount: order.plan.extras[0],
        created_at: at(order.created),
      });
    }
  }

  // Purchases (07): trips of one owner, branch, day and payment type; each record's receipt.
  const trips = new Map<string, { id: string; count: number }>();
  const movementsToPost: {
    at: number;
    branch: Branch;
    variant: Variant;
    type: MovementType;
    qty: string;
    unitCost: bigint | null;
    purchaseId?: string;
    documentLine?: string;
    actor: Person;
  }[] = [];
  const actuals = new Map<string, bigint>();
  const lastPrice = new Map<string, { price: bigint; at: number }>();
  for (const order of plans) {
    const story = stories.get(order.id)!;
    const bought = story.purchase;
    if (bought === null) continue;
    const day = Math.floor((bought.at + TASHKENT) / DAY);
    let key = `${order.owner.id}|${order.branch.id}|${day}|${order.plan.paymentType}`;
    let trip = trips.get(key);
    if (trip !== undefined && trip.count >= 5) {
      key += `|${order.id}`;
      trip = undefined;
    }
    if (trip === undefined) {
      trip = { id: randomUUID(), count: 0 };
      trips.set(key, trip);
      rows.add("purchase_trips", {
        id: trip.id,
        client_key: randomUUID(),
        branch_id: order.branch.id,
        purchased_on: businessDate(at(bought.at)),
        supplier_id: random.pick(suppliers),
        payment_type: order.plan.paymentType,
        created_by: order.owner.id,
        created_at: at(bought.at),
      });
    }
    trip.count += 1;
    const purchaseId = randomUUID();
    rows.add("purchases", {
      id: purchaseId,
      trip_id: trip.id,
      order_id: order.id,
      branch_id: order.branch.id,
      variant_id: bought.variant.id,
      qty: bought.qty,
      unit_price: bought.unitPrice,
      comment: null,
      give_to_requester: false,
      is_cancelled: false,
      cancel_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      created_by: order.owner.id,
      created_at: at(bought.at),
    });
    if (bought.extra !== null) {
      rows.add("purchase_extras", {
        id: randomUUID(),
        purchase_id: purchaseId,
        extra_cost_type_id: order.extraType,
        amount: bought.extra,
        payment_type: order.plan.paymentType,
        created_at: at(bought.at),
      });
    }
    actuals.set(
      order.id,
      actualTotal([
        {
          qty: bought.qty,
          unitPrice: bought.unitPrice,
          extras: bought.extra === null ? [] : [bought.extra],
          isCancelled: false,
        },
      ]),
    );
    if (bought.unitPrice > 0n) {
      rows.add("price_history", {
        id: randomUUID(),
        variant_id: bought.variant.id,
        price: bought.unitPrice,
        source: "PURCHASE",
        note: null,
        set_by: order.owner.id,
        purchase_id: purchaseId,
        client_key: null,
        created_at: at(bought.at),
      });
      lastPrice.set(bought.variant.id, { price: bought.unitPrice, at: bought.at });
    }
    const move = story.moves.find((each) => each.type === "RECORD_PURCHASE")!;
    move.payload = {
      purchase: {
        id: purchaseId,
        variantId: bought.variant.id,
        qty: bought.qty,
        unitPrice: bought.unitPrice.toString(),
      },
    };
    move.group = `${trip.id}`;
    if (bought.variant.goods) {
      movementsToPost.push({
        at: bought.at,
        branch: order.branch,
        variant: bought.variant,
        type: "RECEIPT",
        qty: bought.qty,
        unitCost: bought.unitPrice,
        purchaseId,
        actor: order.owner,
      });
    }
  }

  // The history rows: one order_actions row per action, one event per order, the cash of each
  // move as its money action (08 Money ledger 1: one action per Manager).
  const actions = new Map<string, { id: string; moves: { order: Plan; move: Move }[] }>();
  for (const order of plans) {
    for (const move of stories.get(order.id)!.moves) {
      const key = `${move.type}|${move.group || order.id}`;
      let action = actions.get(key);
      if (action === undefined) actions.set(key, (action = { id: randomUUID(), moves: [] }));
      action.moves.push({ order, move });
    }
  }
  const notices: Row[] = [];
  const noticeTypes: Record<string, string> = {
    SUBMIT: "REQUEST_SUBMITTED",
    SUBMIT_AGAIN: "REQUEST_SUBMITTED",
    SEND_BACK: "REQUEST_SENT_BACK",
    REJECT: "REQUEST_REJECTED",
    SEND_TO_SETTLEMENT: "REQUEST_SENT_TO_SETTLEMENT",
    CLOSE: "REQUEST_CLOSED",
  };
  const sortedActions = [...actions.values()].sort(
    (a, b) => a.moves[0]!.move.at - b.moves[0]!.move.at,
  );
  for (const action of sortedActions) {
    const first = action.moves[0]!.move;
    rows.add("order_actions", {
      id: action.id,
      client_key: randomUUID(),
      type: first.type,
      actor_id: first.actor.id,
      reason: first.reason ?? null,
      order_count: action.moves.length,
      created_at: at(first.at),
    });
    const moneyOf = new Map<string, string>();
    const cashMove = action.moves.find(({ move }) => move.cash !== undefined)?.move.cash;
    if (cashMove !== undefined) {
      const blocks =
        cashMove.kind === "CASH_GIVEN"
          ? approvalCashRows(
              action.moves.map(({ order, move }) => ({
                id: order.id,
                ownerId: order.owner.id,
                amount: move.cash?.amount ?? 0n,
              })),
            ).map((block) => ({
              managerId: block.managerId,
              rows: block.rows.map((row) => ({ ...row, kind: "CASH_GIVEN" as MoneyRowKind })),
            }))
          : settlementCashRows(
              action.moves.map(({ order, move }) => ({
                id: order.id,
                ownerId: order.owner.id,
                kind: move.cash!.kind as "CASH_RETURNED" | "PAID_BACK",
                amount: move.cash!.amount,
              })),
            );
      for (const block of blocks) {
        const moneyId = randomUUID();
        rows.add("money_actions", {
          id: moneyId,
          client_key: randomUUID(),
          order_action_id: action.id,
          manager_id: block.managerId,
          occurred_on: businessDate(at(first.at)),
          supplier_id: null,
          document_no: null,
          file_id: null,
          comment: null,
          is_cancelled: false,
          cancel_reason: null,
          cancelled_by: null,
          cancelled_at: null,
          created_by: first.actor.id,
          created_at: at(first.at),
        });
        for (const row of block.rows) {
          rows.add("money_rows", {
            id: randomUUID(),
            money_action_id: moneyId,
            order_id: row.orderId,
            kind: row.kind,
            amount: row.amount,
            created_at: at(first.at),
          });
          if (row.kind !== "CASH_GIVEN") moneyOf.set(row.orderId, moneyId);
        }
      }
    }
    const owners = new Set<string>();
    for (const { order, move } of action.moves) {
      owners.add(order.owner.id);
      const money = moneyOf.get(order.id);
      rows.add("order_events", {
        id: randomUUID(),
        order_id: order.id,
        action_id: action.id,
        type: move.type,
        from_status: move.from,
        to_status: move.to,
        actor_id: move.actor.id,
        comment: move.reason ?? null,
        note: null,
        payload:
          money !== undefined
            ? {
                money: {
                  actionId: money,
                  kind: move.cash!.kind,
                  amount: move.cash!.amount.toString(),
                },
              }
            : (move.payload ?? null),
        created_at: at(move.at),
      });
      if (move.type === "CONFIRM_SETTLEMENT") {
        rows.add("order_settlements", {
          order_id: order.id,
          transfer_confirmed_by: order.plan.paymentType === "TRANSFER" ? move.actor.id : null,
          transfer_confirmed_at: order.plan.paymentType === "TRANSFER" ? at(move.at) : null,
          transfer_note: null,
          card_confirmed_by: order.plan.paymentType === "CARD" ? move.actor.id : null,
          card_confirmed_at: order.plan.paymentType === "CARD" ? at(move.at) : null,
          overspend_ack_by: null,
          overspend_ack_at: null,
          overspend_ack_comment: null,
          created_at: at(move.at),
        });
      }
    }
    // One notice per person told and branch (10 Notifications), read after a week.
    const branch = action.moves[0]!.order.branch;
    const type =
      noticeTypes[first.type] ??
      (first.type === "APPROVE"
        ? first.to === "PENDING_PRINCIPAL"
          ? "REQUEST_HEAD_APPROVED"
          : first.to === "PENDING_FINANCE"
            ? "REQUEST_PRINCIPAL_APPROVED"
            : "REQUEST_FINANCE_APPROVED"
        : null);
    if (type !== null) {
      const told =
        first.type === "SUBMIT" || first.type === "SUBMIT_AGAIN" ? [head.id] : [...owners];
      for (const userId of told) {
        notices.push({
          id: randomUUID(),
          user_id: userId,
          type,
          params: { actor: first.actor.name, count: action.moves.length, branch: branch.code },
          link: `/orders?${new URLSearchParams({ branch: branch.id, action: action.id }).toString()}`,
          read_at: first.at < end - 7 * DAY ? at(first.at + HOUR) : null,
          created_at: at(first.at),
        });
      }
    }
  }

  // Warehouse (09): opening stock by direct entry, then issues, returns, write-offs and
  // transfers, all posted in time order through nextBalance(), never below 0.
  const documents: { at: number; branch: Branch; type: DocumentType; row: Row; lines: Row[] }[] =
    [];
  const document = (
    when: number,
    branch: Branch,
    type: DocumentType,
    fields: Row,
    actor: Person,
  ) => {
    const row: Row = {
      id: randomUUID(),
      number: "",
      type,
      branch_id: branch.id,
      to_branch_id: null,
      department_id: null,
      received_by_name: null,
      doc_date: businessDate(at(when)),
      status: "POSTED",
      reason: null,
      comment: null,
      client_key: randomUUID(),
      created_by: actor.id,
      decided_by: null,
      decided_at: null,
      reversed_by: null,
      reversed_at: null,
      reverse_reason: null,
      created_at: at(when),
      import_id: null,
      ...fields,
    };
    const made = { at: when, branch, type, row, lines: [] as Row[] };
    documents.push(made);
    return made;
  };
  const lineOf = (
    made: (typeof documents)[number],
    variant: Variant,
    qty: string,
    extra: Row = {},
  ) => {
    const id = randomUUID();
    made.lines.push({
      id,
      document_id: made.row.id,
      variant_id: variant.id,
      qty,
      counted_qty: null,
      received_qty: null,
      unit_cost: null,
      created_at: made.row.created_at,
      start_seq: null,
      recount: false,
      ...extra,
    });
    return id;
  };
  const goods = variants.filter((variant) => variant.goods && !variant.decimal);
  for (const branch of branches) {
    const entry = document(start, branch, "DIRECT_ENTRY", { reason: "EXISTING_STOCK" }, head);
    for (let v = 0; v < 150; v += 1) {
      const variant = goods[(v * 7 + branch.code.charCodeAt(1)) % goods.length]!;
      if (entry.lines.some((line) => line.variant_id === variant.id)) continue;
      const qty = String(random.int(10, 200));
      const lineId = lineOf(entry, variant, qty, { unit_cost: variant.price });
      movementsToPost.push({
        at: start,
        branch,
        variant,
        type: "DIRECT_ENTRY",
        qty,
        unitCost: variant.price,
        documentLine: lineId,
        actor: head,
      });
    }
  }
  movementsToPost.sort((a, b) => a.at - b.at);

  // Issues follow receipts by a few days; the rest (returns, write-offs, transfers) are drawn
  // as the ledger runs, so each takes only what the stock holds at that moment.
  const balances = new Map<string, StockBalance>();
  const keyOf = (branch: Branch, variant: Variant) => `${branch.id}|${variant.id}`;
  const queue = [...movementsToPost];
  const pending: typeof movementsToPost = [];
  const issueDocs = new Map<string, (typeof documents)[number]>();
  const movementRows: Row[] = [];
  const post = (item: (typeof movementsToPost)[number]): NextBalance | null => {
    const key = keyOf(item.branch, item.variant);
    const balance = balances.get(key) ?? { qty: "0", avgCost: 0n };
    const result = nextBalance(balance, {
      type: item.type,
      qtyDelta: item.qty,
      unitCost: item.unitCost,
      ...(item.type === "RETURN" ? { emptyCost: item.variant.price } : {}),
    });
    if (!result.ok) return null;
    balances.set(key, { qty: result.qty, avgCost: result.avgCost });
    movementRows.push({
      id: randomUUID(),
      branch_id: item.branch.id,
      variant_id: item.variant.id,
      type: item.type,
      qty_delta: item.qty,
      unit_cost: result.unitCost,
      balance_after: result.qty,
      purchase_id: item.purchaseId ?? null,
      document_line_id: item.documentLine ?? null,
      reverses_movement_id: null,
      created_by: item.actor.id,
      created_at: at(item.at),
    });
    return result;
  };
  type NextBalance = Extract<ReturnType<typeof nextBalance>, { ok: true }>;
  const whole = (qty: string) => Math.floor(Number(qty));
  let cursor = 0;
  const take = () => {
    const nextQueued = queue[cursor];
    const nextPending = pending[0];
    if (
      nextPending !== undefined &&
      (nextQueued === undefined || nextPending.at <= nextQueued.at)
    ) {
      return pending.shift()!;
    }
    cursor += 1;
    return nextQueued;
  };
  const later = (item: (typeof movementsToPost)[number]) => {
    if (item.at >= end) return;
    let low = 0;
    let high = pending.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (pending[mid]!.at <= item.at) low = mid + 1;
      else high = mid;
    }
    pending.splice(low, 0, item);
  };
  for (let item = take(); item !== undefined; item = take()) {
    const posted = post(item);
    if (posted === null) continue;
    if (item.type === "RECEIPT" || item.type === "DIRECT_ENTRY") {
      // Most of what comes in is issued to a department within two weeks (09 Issue).
      const qty = whole(posted.qty);
      const issued = Math.floor(qty * (item.type === "RECEIPT" ? 0.8 : 0.3));
      if (issued > 0 && item.variant.goods) {
        later({
          ...item,
          type: "ISSUE",
          qty: String(-issued),
          unitCost: null,
          at: item.at + random.int(1, 14) * DAY,
          purchaseId: undefined,
          documentLine: undefined,
        });
      }
      continue;
    }
    if (item.type === "ISSUE") {
      const left = whole(posted.qty);
      if (left > 2 && random.chance(0.04)) {
        later({
          ...item,
          type: "WRITE_OFF",
          qty: String(-1),
          at: item.at + random.int(3, 30) * DAY,
        });
      } else if (left > 4 && random.chance(0.03)) {
        later({
          ...item,
          type: "TRANSFER_OUT",
          qty: String(-Math.floor(left / 2)),
          at: item.at + random.int(2, 20) * DAY,
        });
      } else if (random.chance(0.03)) {
        later({ ...item, type: "RETURN", qty: "1", at: item.at + random.int(2, 20) * DAY });
      }
      continue;
    }
    if (item.type === "TRANSFER_OUT") {
      const to = branches[(branches.indexOf(item.branch) + 1) % branches.length]!;
      if (to !== item.branch) {
        later({
          ...item,
          branch: to,
          type: "TRANSFER_IN",
          qty: item.qty.slice(1),
          unitCost: posted.unitCost,
          at: item.at + DAY,
        });
      }
    }
  }
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const arrived = new Set<string>();
  // Documents for the movements that have none yet: one per branch, type and day (and
  // department for an issue or a return), their lines one per movement.
  for (const movement of movementRows) {
    if (movement.purchase_id !== null || movement.document_line_id !== null) continue;
    const type = movement.type as MovementType;
    if (type === "TRANSFER_IN") continue;
    const branch = branches.find((each) => each.id === movement.branch_id)!;
    const when = (movement.created_at as Date).getTime();
    const docType: DocumentType =
      type === "ISSUE"
        ? "ISSUE"
        : type === "RETURN"
          ? "RETURN"
          : type === "WRITE_OFF"
            ? "WRITE_OFF"
            : "TRANSFER";
    const department =
      docType === "ISSUE" || docType === "RETURN" ? random.pick(branch.departments) : null;
    const key = `${branch.id}|${docType}|${Math.floor((when + TASHKENT) / DAY)}|${department}`;
    let made = docType === "ISSUE" ? issueDocs.get(key) : undefined;
    if (made === undefined) {
      made = document(
        when,
        branch,
        docType,
        {
          department_id: department,
          received_by_name: department === null ? null : "Qabul qiluvchi",
          reason: docType === "WRITE_OFF" ? "DAMAGED" : null,
          decided_by: docType === "WRITE_OFF" ? head.id : null,
          decided_at: docType === "WRITE_OFF" ? at(when) : null,
          to_branch_id:
            docType === "TRANSFER"
              ? branches[(branches.indexOf(branch) + 1) % branches.length]!.id
              : null,
          status: docType === "TRANSFER" ? "RECEIVED" : "POSTED",
        },
        managers.get(branch.id)![0]!,
      );
      if (docType === "ISSUE") issueDocs.set(key, made);
    }
    const qty = String(movement.qty_delta).replace("-", "");
    const variant = variantById.get(movement.variant_id as string)!;
    movement.document_line_id = lineOf(made, variant, qty, {
      received_qty: docType === "TRANSFER" ? qty : null,
      unit_cost: docType === "RETURN" ? variant.price : null,
    });
    if (docType === "TRANSFER") {
      const arrival = movementRows.find(
        (each) =>
          each.type === "TRANSFER_IN" &&
          each.document_line_id === null &&
          each.variant_id === movement.variant_id &&
          (each.created_at as Date).getTime() === when + DAY,
      );
      if (arrival !== undefined) {
        arrival.document_line_id = movement.document_line_id;
        arrived.add(movement.document_line_id as string);
      }
    }
  }
  for (const made of documents) {
    if (made.type === "TRANSFER" && made.lines.every((line) => !arrived.has(line.id as string))) {
      made.row.status = "IN_TRANSIT";
    }
  }
  const docCounters = new Map<string, number>();
  documents.sort((a, b) => a.at - b.at);
  for (const made of documents) {
    const year = businessYear(at(made.at));
    const key = `${made.branch.id}|${made.type}|${year}`;
    const value = (docCounters.get(key) ?? 0) + 1;
    docCounters.set(key, value);
    made.row.number = documentNumber(made.type, made.branch.code, year, value);
  }

  // The rest of the order rows that depend on the buying: actual totals, stock at submit.
  for (const order of rows.tables.get("orders") ?? []) {
    const actual = actuals.get(order.id as string);
    if (actual !== undefined) order.actual_total = actual;
  }
  for (const variant of rows.tables.get("product_variants") ?? []) {
    const last = lastPrice.get(variant.id as string);
    if (last !== undefined) {
      variant.last_purchase_price = last.price;
      variant.last_purchase_at = at(last.at);
    }
  }
  for (const branch of branches) {
    for (const variant of goods.slice(0, 200)) {
      rows.add("stock_minimums", {
        branch_id: branch.id,
        variant_id: variant.id,
        min_qty: String(random.int(1, 30)),
        low_notified_at: null,
        created_at: at(start),
        updated_at: at(start),
      });
    }
  }
  for (const [key, balance] of balances) {
    const [branchId, variantId] = key.split("|");
    rows.add("stock_balances", {
      branch_id: branchId,
      variant_id: variantId,
      qty: balance.qty,
      avg_cost: balance.avgCost,
      created_at: at(start),
      updated_at: at(end - HOUR),
    });
  }
  for (const [key, value] of counters) {
    const [branchId, year] = key.split("|");
    rows.add("number_counters", {
      scope: "ORD",
      branch_id: branchId,
      year: Number(year),
      last_value: value,
      created_at: at(start),
    });
  }
  const scopes: Record<DocumentType, string> = {
    ISSUE: "ISS",
    RETURN: "RET",
    TRANSFER: "TRF",
    WRITE_OFF: "WOF",
    COUNT: "CNT",
    DIRECT_ENTRY: "ENT",
  };
  for (const [key, value] of docCounters) {
    const [branchId, type, year] = key.split("|");
    rows.add("number_counters", {
      scope: scopes[type as DocumentType],
      branch_id: branchId,
      year: Number(year),
      last_value: value,
      created_at: at(start),
    });
  }

  // In the order the foreign keys need. Orders go in as drafts, then move to their status.
  rows.tables.set(
    "stock_documents",
    documents.map((made) => made.row),
  );
  rows.tables.set(
    "stock_document_lines",
    documents.flatMap((made) => made.lines),
  );
  rows.tables.set("stock_movements", movementRows);
  rows.tables.set("notifications", notices);
  const order = [
    "user_branches",
    "departments",
    "units",
    "categories",
    "companies",
    "extra_cost_types",
    "products",
    "product_variants",
    "catalog_suggestions",
    "orders",
    "order_extras",
    "order_actions",
    "order_events",
    "purchase_trips",
    "purchases",
    "purchase_extras",
    "price_history",
    "money_actions",
    "money_rows",
    "order_settlements",
    "stock_documents",
    "stock_document_lines",
    "stock_movements",
    "stock_balances",
    "stock_minimums",
    "number_counters",
    "notifications",
    "audit_log",
  ];
  const counts: FillCounts = {};
  for (const table of order) {
    const list = rows.tables.get(table) ?? [];
    await insertAll(query, table, list);
    counts[table] = list.length;
  }
  const statuses = new Map(plans.map((each) => [each.id, stories.get(each.id)!.status]));
  const moved = [...statuses].filter(([, status]) => status !== "DRAFT");
  for (let from = 0; from < moved.length; from += 5000) {
    await query(
      `update orders o set status = s.status::request_status,
         progress = s.progress::order_progress, finish_reason = s.reason
       from json_to_recordset($1::json) as s(id uuid, status text, progress text, reason text)
       where o.id = s.id`,
      [
        json(
          moved.slice(from, from + 5000).map(([id, status]) => ({
            id,
            status,
            progress: stories.get(id)!.progress,
            reason: stories.get(id)!.finishReason,
          })),
        ),
      ],
    );
  }
  // The copy of the plan at each submit (14 order_revisions), as writeSnapshots() writes it.
  await query(`
    insert into order_revisions (order_id, revision, submission, snapshot, created_at)
    select o.id, o.revision, 1, jsonb_build_object(
      'number', o.number, 'branchId', o.branch_id, 'variantId', o.variant_id,
      'companyId', o.company_id, 'departmentId', o.department_id,
      'requesterName', o.requester_name, 'neededBy', o.needed_by,
      'quantity', o.planned_qty::text, 'price', o.planned_price::text,
      'extras', coalesce((
        select jsonb_agg(jsonb_build_object(
          'extraCostTypeId', e.extra_cost_type_id, 'amount', e.amount::text
        ) order by e.created_at, e.id)
        from order_extras e where e.order_id = o.id), '[]'::jsonb),
      'plannedTotal', o.planned_total::text, 'paymentType', o.payment_type,
      'priority', o.priority, 'urgentReason', o.urgent_reason, 'comment', o.comment,
      'referencePhotoFileId', o.reference_photo_file_id, 'stockAtSubmit', o.stock_at_submit::text
    ), o.submitted_at
    from orders o where o.number is not null`);
  counts.order_revisions = moved.length;
  counts.users = 1 + sizes.branches + finance.length + sizes.managers;
  return counts;
}
