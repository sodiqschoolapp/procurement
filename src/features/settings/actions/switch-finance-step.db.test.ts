import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { approveOrders } from "@/features/orders/actions/approve";
import { setUserActive } from "@/features/users/actions/users";
import { listBranchVacancies } from "@/features/users/queries/users";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { auditLog, notifications, orders, settings } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { readSettings } from "@/server/settings";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import {
  DAY,
  atPrincipal,
  ordersNow,
  setFinanceStep,
  stepScene,
  ticked,
} from "../../../../tests/helpers/finance-step";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { switchFinanceStep } from "./switch-finance-step";

// The Head's switch of the Finance step (06-approval-workflow.md, Finance step switched off 5, 6
// and 7; edge-cases/requests-and-approval.md, "The Head switches the Finance step off while orders
// wait for Finance or for settlement"; 03 rule 5; plan of 4.10c, decided items 1, 9, 10 and 12).
// Each test file has its own database, so the switch's school-wide count sees only this file's
// orders; a test that leaves an order waiting moves it on at its end. The roles are in
// switch-finance-step-matrix.db.test.ts.

const SETTINGS_LOCK = "select pg_advisory_xact_lock(hashtextextended('settings', 1))";

async function storedStep() {
  return (await readSettings(db)).finance_step;
}

async function switchAudits() {
  return db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "settings.change"), sql`${auditLog.after} ? 'finance_step'`))
    .orderBy(auditLog.createdAt, auditLog.id);
}

describe("switching off (06 Finance step switched off 5)", () => {
  it("is refused while an order waits for Finance in one branch and one for settlement in another, naming both; nothing is written", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const owner = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const finance = await insertOrder({
      branchId: first.id,
      ownerId: owner.id,
      status: "PENDING_FINANCE",
    });
    const settlement = await insertOrder({
      branchId: second.id,
      ownerId: owner.id,
      status: "SETTLEMENT",
    });
    const auditsBefore = (await switchAudits()).length;

    const answer = await runAction(switchFinanceStep, head.id, { on: false });

    expect(answer).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_input",
        fields: { orders: "errors.field.financeStepWaiting" },
        available: { orders: [finance.number, settlement.number].sort().join(", ") },
      }),
    });
    expect(await storedStep()).toBe(true);
    expect(await db.select().from(settings).where(eq(settings.key, "finance_step"))).toEqual([]);
    expect((await switchAudits()).length).toBe(auditsBefore);

    // Once Finance has dealt with both, the step switches off (S21's second try).
    await setOrderStatus(finance.id, "PURCHASING");
    await setOrderStatus(settlement.id, "CLOSED");
    expect(await runAction(switchFinanceStep, head.id, { on: false })).toMatchObject({ ok: true });
    expect(await storedStep()).toBe(false);
    await setFinanceStep(true);
  });

  it("goes through beside an order Waiting for Principal, one Open through Finance and a Closed one in two branches (D40), and writes one audit row each way (rule 7)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const owner = await insertUser("MANAGER", { branches: [first.id, second.id] });
    for (const branch of [first, second]) {
      for (const status of ["PENDING_PRINCIPAL", "PURCHASING", "CLOSED", "RETURNED"] as const) {
        await insertOrder({ branchId: branch.id, ownerId: owner.id, status });
      }
    }
    const before = (await switchAudits()).length;

    expect(await runAction(switchFinanceStep, head.id, { on: false })).toEqual({
      ok: true,
      data: { changed: true, on: false },
    });
    expect(await storedStep()).toBe(false);
    // The same value again writes nothing (plan of 4.10c, decided item 9).
    expect(await runAction(switchFinanceStep, head.id, { on: false })).toEqual({
      ok: true,
      data: { changed: false, on: false },
    });
    // A later moment, so the two audit rows read in their order.
    setClock(`${DAY}T07:05:00Z`);
    expect(await runAction(switchFinanceStep, head.id, { on: true })).toMatchObject({ ok: true });
    expect(await storedStep()).toBe(true);

    expect((await switchAudits()).slice(before)).toEqual([
      { before: { finance_step: true }, after: { finance_step: false } },
      { before: { finance_step: false }, after: { finance_step: true } },
    ]);
  });

  it("switching on is never refused by waiting orders (rule 6 changes only later approvals)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [branch.id] });
    await setFinanceStep(false);
    const waiting = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "SETTLEMENT",
    });
    expect(await runAction(switchFinanceStep, head.id, { on: true })).toMatchObject({ ok: true });
    expect(await storedStep()).toBe(true);
    await setOrderStatus(waiting.id, "CLOSED");
  });
});

describe("the switch and a Principal's approval at the same moment (Done when; plan of 4.10c, decided item 1, Look first)", () => {
  // A third transaction holds the settings lock; the two actions meet on no row besides it: the
  // approval locks its own order, the switch locks no order (.claude/rules/tests.md).
  it("approval first: the order waits for Finance and the switch is refused naming it", async () => {
    setClock(`${DAY}T07:00:00Z`);
    await setFinanceStep(true);
    const s = await stepScene();
    const order = await atPrincipal(s);
    const approval = await ticked([order.id]);

    const [approved, switched] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runOrdersAction(approveOrders, s.principal.id, approval),
        () => runAction(switchFinanceStep, s.head.id, { on: false }),
      ],
    );

    expect(approved).toMatchObject({ ok: true });
    expect((await ordersNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedFinance: false,
    });
    const [number] = await db
      .select({ number: orders.number })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(switched).toMatchObject({
      ok: false,
      error: { code: "invalid_input", available: { orders: number!.number } },
    });
    expect(await storedStep()).toBe(true);
    await setOrderStatus(order.id, "REJECTED");
  });

  it("switch first: the step is off and the approval opens the order with the mark", async () => {
    setClock(`${DAY}T07:00:00Z`);
    await setFinanceStep(true);
    const s = await stepScene();
    const order = await atPrincipal(s);
    const approval = await ticked([order.id]);

    const [switched, approved] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runAction(switchFinanceStep, s.head.id, { on: false }),
        () => runOrdersAction(approveOrders, s.principal.id, approval),
      ],
    );

    expect(switched).toMatchObject({ ok: true, data: { changed: true, on: false } });
    expect(approved).toMatchObject({ ok: true });
    expect((await ordersNow([order.id])).get(order.id)).toMatchObject({
      status: "PURCHASING",
      skippedFinance: true,
    });
    await setFinanceStep(true);
  });
});

describe("no Finance vacancy while the step is off (03 rule 5; 10 Notifications; plan of 4.10c, decided item 12)", () => {
  it("the Users page warning leaves out Finance with the step off and names it with the step on; a Manager vacancy shows either way", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    await insertUser("PRINCIPAL", { branches: [branch.id] });
    const rolesOf = async () =>
      (await listBranchVacancies(head.id)).find((each) => each.id === branch.id)?.roles;

    await setFinanceStep(false);
    expect(await rolesOf()).toEqual(["MANAGER"]);
    await setFinanceStep(true);
    expect(await rolesOf()).toEqual(["MANAGER", "FINANCE"]);
  });

  it("deactivating a branch's only Finance user tells the Head with the step on, and not with it off", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const vacated = async (on: boolean) => {
      await setFinanceStep(on);
      const branch = await insertBranch();
      await insertUser("MANAGER", { branches: [branch.id] });
      await insertUser("PRINCIPAL", { branches: [branch.id] });
      const finance = await insertUser("FINANCE", { branches: [branch.id] });
      expect(
        await runAction(setUserActive, head.id, { id: finance.id, active: false }),
      ).toMatchObject({ ok: true });
      return db
        .select({ params: notifications.params })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, head.id),
            eq(notifications.type, "BRANCH_ROLE_VACANT"),
            inArray(notifications.branchId, [branch.id]),
          ),
        );
    };
    expect(await vacated(true)).toEqual([{ params: expect.objectContaining({ role: "FINANCE" }) }]);
    expect(await vacated(false)).toEqual([]);
    await setFinanceStep(true);
  });
});
