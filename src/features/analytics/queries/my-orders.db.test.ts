import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  decided,
  moneyOn,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getApprovalOrders } from "./approval-orders";
import { getCashOrders } from "./cash-orders";
import { getMyCash } from "./my-cash";
import { getMyEstimates } from "./my-estimates";
import { getMyOrders } from "./my-orders";
import { getSpendingRecords } from "./spending-records";
import { getStatusOrders } from "./status-orders";

// Build-plan 6.5b, Done when: "A database test: the Manager's blocks hold only the Manager's own
// orders in the Manager's branches" (10-notifications-analytics-reports.md, Analytics page per
// role, "Manager, own branches"; 03-roles-and-permissions.md rules 1 and 7; developer-rules.md
// rule 4; plan of 6.5b, decided item 6, Look first). The same scene is built four times: for the
// Manager in the Manager's branch, for a colleague in that branch, for another branch's Manager,
// and for the Manager as owner of orders in a branch the Manager does not hold. Each copy carries
// orders that are sent back, Open, bought, holding and owed cash, so a block that let one copy in
// would show twice the numbers worked by hand below (D40). 15 October 2031 in Tashkent: this
// month is October, the period before September.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";
const REASON = "Narxni tekshiring";

type People = { head: string; principal: string; finance: string };

/** One copy of the scene, owned by `ownerId` in the scene's branch. */
async function ownScene(scene: SpendingScene, ownerId: string, people: People) {
  // My orders (10 Manager: "By status; average time to full approval; share sent back").
  // Submitted 1 October 10:00 Tashkent, sent back, submitted again, Open on 4 October 10:00:
  // 72 hours to full approval, counted on 4 October (plan of 6.5b, decided item 1; the review's
  // worked case).
  const open = await decided(
    scene,
    "PURCHASING",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-01T05:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-02T05:00:00Z",
        reason: REASON,
        actorId: people.head,
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-10-03T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-03T06:00:00Z",
        actorId: people.head,
      },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-10-03T07:00:00Z",
        actorId: people.principal,
      },
      {
        type: "APPROVE",
        from: "PENDING_FINANCE",
        to: "PURCHASING",
        at: "2031-10-04T05:00:00Z",
        actorId: people.finance,
      },
    ],
    { ownerId, submittedAt: "2031-10-01T05:00:00Z" },
  );
  // Waiting for the Head since 10 October.
  const waiting = await decided(
    scene,
    "PENDING_HEAD",
    [{ type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-10T05:00:00Z" }],
    { ownerId, submittedAt: "2031-10-10T05:00:00Z" },
  );
  // Sent back on 12 October for the same reason, spelt otherwise (one reasonKey()).
  await decided(
    scene,
    "RETURNED",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-12T05:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-12T07:00:00Z",
        reason: "  NARXNI   tekshiring ",
        actorId: people.head,
      },
    ],
    { ownerId, submittedAt: "2031-10-12T05:00:00Z" },
  );
  // The period before: submitted 20 September, Open 24 hours later, three approvals.
  await decided(
    scene,
    "PURCHASING",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-09-20T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-09-20T06:00:00Z",
        actorId: people.head,
      },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-09-20T07:00:00Z",
        actorId: people.principal,
      },
      {
        type: "APPROVE",
        from: "PENDING_FINANCE",
        to: "PURCHASING",
        at: "2031-09-21T05:00:00Z",
        actorId: people.finance,
      },
    ],
    { ownerId, submittedAt: "2031-09-20T05:00:00Z" },
  );

  // The bought orders are submitted on 1 August: outside both periods of My orders.
  setClock("2031-08-01T05:00:00Z");
  // My estimates (decided item 4): order A planned 5 000, records 10 at 4 500; order B planned
  // 6 000 of the same product, records 4 at 6 500 of its other subtype (07 Substitution), paid
  // by transfer so no cash count moves.
  const first = await bought(scene, {
    ownerId,
    purchasedOn: "2031-10-03",
    qty: "10",
    unitPrice: "4500",
    plannedPrice: 5_000n,
    paymentType: "TRANSFER",
  });
  const [, otherSubtype] = await insertSubtypes(first.productId, [{}, {}]);
  const second = await insertOrder({
    branchId: scene.branch.id,
    ownerId,
    departmentId: scene.department.id,
    variantId: first.variantId,
    status: "PURCHASING",
    plannedQty: "4",
    plannedPrice: 6_000n,
  });
  await recordOn(
    scene,
    { id: second.id, ownerId, variantId: otherSubtype! },
    { purchasedOn: "2031-10-05", qty: "4", unitPrice: "6500", paymentType: "TRANSFER" },
  );
  const firstOrder = { id: first.orderId, ownerId, variantId: first.variantId };
  // A gift is no price (plan of 6.4b, decided item 1); September is the period before:
  // 2 at 5 500 against 5 000 planned, 10.0 % paid more.
  await recordOn(scene, firstOrder, {
    purchasedOn: "2031-10-06",
    qty: "3",
    unitPrice: "0",
    paymentType: "TRANSFER",
  });
  await recordOn(scene, firstOrder, {
    purchasedOn: "2031-09-10",
    qty: "2",
    unitPrice: "5500",
    paymentType: "TRANSFER",
  });
  // Another product: 1 at 12 000 against 10 000 planned, 20.0 % paid more.
  const dearer = await bought(scene, {
    ownerId,
    purchasedOn: "2031-10-06",
    qty: "1",
    unitPrice: "12000",
    plannedPrice: 10_000n,
    paymentType: "TRANSFER",
  });

  // My cash (decided item 5), bought in August, outside both periods of the estimates: one order
  // holds 5 000, one is owed 8 000; one counts 0 and one is Closed: neither is listed.
  const holds = await bought(scene, { ownerId, purchasedOn: "2031-08-05", unitPrice: "10000" });
  await moneyOn(holds, people.finance, { amount: 15_000n, occurredOn: "2031-08-04" });
  const owed = await bought(scene, { ownerId, purchasedOn: "2031-08-06", unitPrice: "8000" });
  const even = await bought(scene, { ownerId, purchasedOn: "2031-08-07", unitPrice: "3000" });
  await moneyOn(even, people.finance, { amount: 3_000n, occurredOn: "2031-08-07" });
  const closed = await bought(scene, { ownerId, purchasedOn: "2031-08-08", unitPrice: "2000" });
  await moneyOn(closed, people.finance, { amount: 9_000n, occurredOn: "2031-08-08" });
  await setOrderStatus(closed.orderId, "CLOSED");
  setClock(TODAY);

  return {
    waiting: waiting.id,
    open: open.id,
    product: first.productId,
    dearer: dearer.productId,
    holds: holds.orderId,
    owed: owed.orderId,
  };
}

let manager: string;
let colleague: string;
let mine: Awaited<ReturnType<typeof ownScene>>;
let colleagues: Awaited<ReturnType<typeof ownScene>>;

beforeAll(async () => {
  setClock(TODAY);
  const a = await spendingScene();
  const b = await spendingScene();
  manager = a.manager.id;
  colleague = (await insertUser("MANAGER", { branches: [a.branch.id] })).id;
  const head = (await insertUser("HEAD")).id;
  const finance = (await insertUser("FINANCE", { branches: [a.branch.id, b.branch.id] })).id;
  const peopleOf = async (branchId: string) => ({
    head,
    finance,
    principal: (await insertUser("PRINCIPAL", { branches: [branchId] })).id,
  });
  const peopleA = await peopleOf(a.branch.id);
  const peopleB = await peopleOf(b.branch.id);
  mine = await ownScene(a, manager, peopleA);
  colleagues = await ownScene(a, colleague, peopleA);
  await ownScene(b, b.manager.id, peopleB);
  // The Manager's own orders in a branch the Manager does not hold.
  await ownScene(b, manager, peopleB);
  await refreshNow();
  // Taken back to Draft after the refresh: the live draft wall hides a colleague's from the
  // Manager and keeps the Manager's own (06 Statuses: a Draft is seen by its owner and the Head).
  await setOrderStatus(mine.waiting, "DRAFT");
  await setOrderStatus(colleagues.waiting, "DRAFT");
});

// The clock is set again for each test: the test setup puts it back.
beforeEach(() => setClock(TODAY));

const MY_ORDERS = {
  statuses: [
    { status: "PENDING_HEAD", count: 1, change: { difference: 1n, percent: null } },
    { status: "RETURNED", count: 1, change: { difference: 1n, percent: null } },
    { status: "PURCHASING", count: 1, change: { difference: 0n, percent: "0.0" } },
  ],
  total: { count: 3, change: { difference: 2n, percent: "200.0" } },
  approval: { hours: "72.0", count: 1, change: "48.0" },
  decisions: 5,
  sentBack: { count: 2, share: "40.0", change: "40.0" },
  reasons: [
    {
      key: "narxni tekshiring",
      text: "  NARXNI   tekshiring ",
      count: 2,
      change: { difference: 2n, percent: null },
    },
  ],
};

describe("the Manager's blocks hold only the Manager's own orders in the Manager's branches (build-plan 6.5b, Done when)", () => {
  it("My orders: by status, the time to full approval, the share sent back and its reasons", async () => {
    expect(await getMyOrders(manager, THIS_MONTH, NO_ANALYTICS_FILTERS)).toMatchObject(MY_ORDERS);
  });

  it("My estimates: per product and all products, from the Manager's records only", async () => {
    const block = await getMyEstimates(manager, THIS_MONTH, NO_ANALYTICS_FILTERS);
    // Paid more on the dearer product (−20.0 %) comes first: the larger miss either way.
    expect(block.products.map((each) => each.productId)).toEqual([mine.dearer, mine.product]);
    expect(block.products[1]).toMatchObject({
      records: 2,
      qty: "14",
      plannedGoods: 74_000n,
      goods: 71_000n,
      plannedPrice: 5_286n,
      actualPrice: 5_071n,
      difference: 215n,
      percent: "4.1",
      // 4.1 against −10.0 in September (08's sign: below 0 is paid more).
      change: "14.1",
    });
    expect(block.products[0]).toMatchObject({
      difference: -2_000n,
      percent: "-20.0",
      change: null,
    });
    expect(block.all).toMatchObject({
      records: 3,
      qty: "15",
      plannedGoods: 84_000n,
      goods: 83_000n,
      plannedPrice: 5_600n,
      actualPrice: 5_533n,
      difference: 67n,
      percent: "1.2",
      change: "11.2",
    });
  });

  it("My cash: held and owed apart, never netted; a count of 0 and a Closed order absent (08 Manager's cash balance)", async () => {
    const block = await getMyCash(manager, NO_ANALYTICS_FILTERS);
    expect(block.held).toBe(5_000n);
    expect(block.owed).toBe(8_000n);
    expect(block.rows.map((row) => [row.orderId, row.cashCount, row.since])).toEqual([
      [mine.holds, 5_000n, "2031-08-04"],
      [mine.owed, -8_000n, "2031-08-06"],
    ]);
  });

  it("a Manager filter of a colleague in the address changes none of the three (decided item 6)", async () => {
    const theirs: AnalyticsFilters = { ...NO_ANALYTICS_FILTERS, manager: colleague };
    expect(await getMyOrders(manager, THIS_MONTH, theirs)).toMatchObject(MY_ORDERS);
    expect(await getMyEstimates(manager, THIS_MONTH, theirs)).toEqual(
      await getMyEstimates(manager, THIS_MONTH, NO_ANALYTICS_FILTERS),
    );
    expect(await getMyCash(manager, theirs)).toEqual(
      await getMyCash(manager, NO_ANALYTICS_FILTERS),
    );
  });

  it("the colleague's own blocks hold the colleague's copy, the Manager's taken-back Draft hidden", async () => {
    const block = await getMyOrders(colleague, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block).toMatchObject(MY_ORDERS);
    expect(
      (await getMyCash(colleague, NO_ANALYTICS_FILTERS)).rows.map((row) => row.orderId),
    ).toEqual([colleagues.holds, colleagues.owed]);
  });

  it("another branch's filter is Not found (03 rule 1)", async () => {
    const other = (await spendingScene()).branch.id;
    const filters = { ...NO_ANALYTICS_FILTERS, branch: other };
    for (const read of [
      () => getMyOrders(manager, THIS_MONTH, filters),
      () => getMyEstimates(manager, THIS_MONTH, filters),
      () => getMyCash(manager, filters),
    ]) {
      await expect(read()).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});

// 10 point 3: "Clicking any bar, slice or number opens the list of orders or records that make it
// up"; plan of 6.5b, decided item 8; review of the plan, correction 2. Each list is opened as the
// block links it, with the Manager as the Manager filter.
describe("every number of the Manager's blocks equals the list behind it (10 point 3)", () => {
  const mineOnly = (): AnalyticsFilters => ({ ...NO_ANALYTICS_FILTERS, manager });

  it("the time to full approval: the orders that reached Open, their count and average hours", async () => {
    const list = await getStatusOrders(manager, THIS_MONTH, mineOnly(), { kind: "approved" }, 1);
    expect(list.count).toBe(MY_ORDERS.approval.count);
    expect(list.hours).toBe(MY_ORDERS.approval.hours);
    expect(list.rows.map((row) => [row.orderId, row.openedOn, row.approvalHours])).toEqual([
      [mine.open, "2031-10-04", "72.0"],
    ]);
  });

  it("a status count", async () => {
    const list = await getStatusOrders(
      manager,
      THIS_MONTH,
      mineOnly(),
      { kind: "status", status: "PURCHASING" },
      1,
    );
    expect(list.count).toBe(1);
    expect(list.rows.map((row) => row.orderId)).toEqual([mine.open]);
  });

  // The My orders total opens its list too (build-plan 6.5a-2; plan of 6.5a-2, decided item 2).
  it("the total: the Manager's own orders of the period at every status", async () => {
    const list = await getStatusOrders(
      manager,
      THIS_MONTH,
      mineOnly(),
      { kind: "status", status: null },
      "all",
    );
    expect(list.count).toBe(MY_ORDERS.total.count);
    expect(list.rows.map((row) => row.status).sort()).toEqual(
      MY_ORDERS.statuses.map((row) => row.status).sort(),
    );
    const listed = list.rows.map((row) => row.orderId);
    expect(listed).toEqual(expect.arrayContaining([mine.waiting, mine.open]));
    expect(listed).not.toContain(colleagues.open);
    expect(listed).not.toContain(colleagues.waiting);
  });

  it("the send backs, in all and of one reason", async () => {
    const key = { kind: "step", step: null, decision: "SEND_BACK" } as const;
    const all = await getApprovalOrders(manager, THIS_MONTH, mineOnly(), key, null, 1);
    expect(all.count).toBe(MY_ORDERS.sentBack.count);
    const reason = await getApprovalOrders(
      manager,
      THIS_MONTH,
      mineOnly(),
      key,
      "narxni tekshiring",
      1,
    );
    expect(reason.count).toBe(MY_ORDERS.reasons[0]!.count);
  });

  it("an estimate's records and the records of all products: Σ quantity and Σ goods", async () => {
    const block = await getMyEstimates(manager, THIS_MONTH, NO_ANALYTICS_FILTERS);
    for (const [product, estimate] of [
      [mine.product, block.products[1]!],
      [null, block.all],
    ] as const) {
      const list = await getSpendingRecords(
        manager,
        THIS_MONTH,
        mineOnly(),
        { kind: "priced", product },
        "all",
      );
      expect(list.count).toBe(estimate.records);
      // The list's quantity is numeric(14,3) text, the domain's plain decimal text.
      expect(Number(list.priced!.qty)).toBe(Number(estimate.qty));
      expect(list.priced!.goods).toBe(estimate.goods);
    }
  });

  it("cash held: the held list of Money with managers' view", async () => {
    const block = await getMyCash(manager, NO_ANALYTICS_FILTERS);
    const list = await getCashOrders(manager, mineOnly(), false, "all");
    expect(list.held).toBe(block.held);
    expect(list.rows.map((row) => row.orderId)).toEqual([mine.holds]);
  });
});
