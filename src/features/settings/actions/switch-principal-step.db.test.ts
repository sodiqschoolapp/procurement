import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { approveOrders } from "@/features/orders/actions/approve";
import { submitDrafts } from "@/features/orders/actions/submit";
import { setUserActive } from "@/features/users/actions/users";
import { listBranchVacancies } from "@/features/users/queries/users";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { auditLog, notifications, orders, settings } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { readSettings } from "@/server/settings";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { DAY, setFinanceStep, stepScene, ticked } from "../../../../tests/helpers/finance-step";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import {
  atHead,
  headApproves,
  headDraft,
  marksNow,
  numberOf,
  setPrincipalStep,
} from "../../../../tests/helpers/principal-step";
import { insertUser } from "../../../../tests/helpers/users";
import { switchFinanceStep } from "./switch-finance-step";
import { switchPrincipalStep } from "./switch-principal-step";

// The Head's switch of the Principal step (06-approval-workflow.md, Principal step switched off 4,
// 5 and 7; edge-cases/requests-and-approval.md, "The Head switches the Principal step off while
// orders wait for the Principal"; 03 rule 5; plan of 4.10d, decided items 1, 2, 9, 12 and 13).
// Each test file has its own database, so the switch's school-wide count sees only this file's
// orders; a test that leaves an order waiting moves it on at its end, and every test puts both
// steps back on. The roles are in switch-principal-step-matrix.db.test.ts.

const SETTINGS_LOCK = "select pg_advisory_xact_lock(hashtextextended('settings', 1))";

async function storedStep() {
  return (await readSettings(db)).principal_step;
}

async function switchAudits() {
  return db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "settings.change"), sql`${auditLog.after} ? 'principal_step'`))
    .orderBy(auditLog.createdAt, auditLog.id);
}

describe("switching off (06 Principal step switched off 4)", () => {
  it("is refused while an order waits for the Principal in each of two branches, naming both; nothing is written", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const owner = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const one = await insertOrder({
      branchId: first.id,
      ownerId: owner.id,
      status: "PENDING_PRINCIPAL",
    });
    const two = await insertOrder({
      branchId: second.id,
      ownerId: owner.id,
      status: "PENDING_PRINCIPAL",
    });
    const auditsBefore = (await switchAudits()).length;

    const answer = await runAction(switchPrincipalStep, head.id, { on: false });

    expect(answer).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_input",
        fields: { orders: "errors.field.principalStepWaiting" },
        available: { orders: [one.number, two.number].sort().join(", ") },
      }),
    });
    expect(await storedStep()).toBe(true);
    expect(await db.select().from(settings).where(eq(settings.key, "principal_step"))).toEqual([]);
    expect((await switchAudits()).length).toBe(auditsBefore);

    // Once the Principal has decided both, the step switches off (S25's second try).
    await setOrderStatus(one.id, "PENDING_FINANCE");
    await setOrderStatus(two.id, "REJECTED");
    expect(await runAction(switchPrincipalStep, head.id, { on: false })).toMatchObject({
      ok: true,
    });
    expect(await storedStep()).toBe(false);
    await setPrincipalStep(true);
    await setOrderStatus(one.id, "PURCHASING");
  });

  it("goes through beside orders Waiting for Head, Waiting for Finance, Sent back and Open in two branches (D40), and writes one audit row each way (rule 7)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const owner = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const statuses = ["PENDING_HEAD", "PENDING_FINANCE", "RETURNED", "PURCHASING"] as const;
    const placed: string[] = [];
    for (const branch of [first, second]) {
      for (const status of statuses) {
        placed.push((await insertOrder({ branchId: branch.id, ownerId: owner.id, status })).id);
      }
    }
    const before = (await switchAudits()).length;

    expect(await runAction(switchPrincipalStep, head.id, { on: false })).toEqual({
      ok: true,
      data: { changed: true, on: false },
    });
    expect(await storedStep()).toBe(false);
    // The same value again writes nothing (plan of 4.10d, decided item 12).
    expect(await runAction(switchPrincipalStep, head.id, { on: false })).toEqual({
      ok: true,
      data: { changed: false, on: false },
    });
    // A later moment, so the two audit rows read in their order.
    setClock(`${DAY}T07:05:00Z`);
    expect(await runAction(switchPrincipalStep, head.id, { on: true })).toMatchObject({
      ok: true,
    });
    expect(await storedStep()).toBe(true);

    expect((await switchAudits()).slice(before)).toEqual([
      { before: { principal_step: true }, after: { principal_step: false } },
      { before: { principal_step: false }, after: { principal_step: true } },
    ]);
    for (const id of placed) await setOrderStatus(id, "CANCELLED");
  });
});

describe("switching on (06 Principal step switched off 5)", () => {
  it("is never refused, and orders that skipped the Principal stay Waiting for Finance or Open with their mark", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    await setPrincipalStep(false);
    const toFinance = await atHead(s);
    const toOpen = await atHead(s);
    await headApproves(s, [toFinance.id]);
    await setFinanceStep(false);
    await headApproves(s, [toOpen.id]);
    await setFinanceStep(true);

    expect(await runAction(switchPrincipalStep, s.head.id, { on: true })).toMatchObject({
      ok: true,
      data: { changed: true, on: true },
    });
    const now = await marksNow([toFinance.id, toOpen.id]);
    expect(now.get(toFinance.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedPrincipal: true,
    });
    expect(now.get(toOpen.id)).toMatchObject({
      status: "PURCHASING",
      skippedPrincipal: true,
      skippedFinance: true,
    });
    await setOrderStatus(toFinance.id, "REJECTED");
  });
});

describe("the switch and a Head's approval at the same moment (Done when; plan of 4.10d, decided item 1, Look first)", () => {
  // A third transaction holds the settings lock; the two actions meet on no row besides it: the
  // approval locks its own order, the switch locks no order (.claude/rules/tests.md).
  it("approval first: the order waits for the Principal and the switch is refused naming it", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    const approval = await ticked([order.id]);

    const [approved, switched] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runOrdersAction(approveOrders, s.head.id, approval),
        () => runAction(switchPrincipalStep, s.head.id, { on: false }),
      ],
    );

    expect(approved).toMatchObject({ ok: true });
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      skippedPrincipal: false,
    });
    expect(switched).toMatchObject({
      ok: false,
      error: { code: "invalid_input", available: { orders: await numberOf(order.id) } },
    });
    expect(await storedStep()).toBe(true);
    await setOrderStatus(order.id, "REJECTED");
  });

  it("switch first: the step is off and the approval sends the order to Finance with the mark", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    const approval = await ticked([order.id]);

    const [switched, approved] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runAction(switchPrincipalStep, s.head.id, { on: false }),
        () => runOrdersAction(approveOrders, s.head.id, approval),
      ],
    );

    expect(switched).toMatchObject({ ok: true, data: { changed: true, on: false } });
    expect(approved).toMatchObject({ ok: true });
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedPrincipal: true,
    });
    await setPrincipalStep(true);
    await setOrderStatus(order.id, "REJECTED");
  });
});

describe("the switch and a Head-created Submit at the same moment (06 Principal step switched off 1 and 4; plan of 4.10d, decided item 1, Look first)", () => {
  it("submit first: the order waits for the Principal and the switch is refused naming it", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const draft = await headDraft(s);
    const submit = await ticked([draft.id]);

    const [submitted, switched] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runOrdersAction(submitDrafts, s.head.id, submit),
        () => runAction(switchPrincipalStep, s.head.id, { on: false }),
      ],
    );

    expect(submitted).toMatchObject({ ok: true });
    expect((await marksNow([draft.id])).get(draft.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      skippedPrincipal: false,
    });
    expect(switched).toMatchObject({
      ok: false,
      error: { code: "invalid_input", available: { orders: await numberOf(draft.id) } },
    });
    await setOrderStatus(draft.id, "REJECTED");
  });

  it("switch first: the submit sends the order to Finance with the mark, Created by Head", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const draft = await headDraft(s);
    const submit = await ticked([draft.id]);

    const [switched, submitted] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runAction(switchPrincipalStep, s.head.id, { on: false }),
        () => runOrdersAction(submitDrafts, s.head.id, submit),
      ],
    );

    expect(switched).toMatchObject({ ok: true });
    expect(submitted).toMatchObject({ ok: true });
    expect((await marksNow([draft.id])).get(draft.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedPrincipal: true,
    });
    await setPrincipalStep(true);
    await setOrderStatus(draft.id, "REJECTED");
  });
});

describe("the Finance switch and a Head's approval with the Principal step off (06 Finance step switched off 5; plan of 4.10d, decided item 2, Look first)", () => {
  it("approval first: the order waits for Finance and the Finance switch is refused naming it", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    await setPrincipalStep(false);
    const order = await atHead(s);
    const approval = await ticked([order.id]);

    const [approved, switched] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runOrdersAction(approveOrders, s.head.id, approval),
        () => runAction(switchFinanceStep, s.head.id, { on: false }),
      ],
    );

    expect(approved).toMatchObject({ ok: true });
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedFinance: false,
    });
    expect(switched).toMatchObject({
      ok: false,
      error: { code: "invalid_input", available: { orders: await numberOf(order.id) } },
    });
    expect((await readSettings(db)).finance_step).toBe(true);
    await setPrincipalStep(true);
    await setOrderStatus(order.id, "REJECTED");
  });

  it("switch first: the Finance step is off and the Head's approval opens the order with both marks", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    await setPrincipalStep(false);
    const order = await atHead(s);
    const approval = await ticked([order.id]);

    const [switched, approved] = await heldWhile(
      SETTINGS_LOCK,
      [],
      [
        () => runAction(switchFinanceStep, s.head.id, { on: false }),
        () => runOrdersAction(approveOrders, s.head.id, approval),
      ],
    );

    expect(switched).toMatchObject({ ok: true, data: { changed: true, on: false } });
    expect(approved).toMatchObject({ ok: true });
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PURCHASING",
      skippedPrincipal: true,
      skippedFinance: true,
    });
    await setFinanceStep(true);
    await setPrincipalStep(true);
  });
});

describe("no Principal vacancy while the step is off (03 rule 5; 10 Notifications; plan of 4.10d, decided item 9)", () => {
  it("the Users page warning leaves out the Principal with the step off and names it with the step on; a Manager vacancy shows either way", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    await insertUser("FINANCE", { branches: [branch.id] });
    const rolesOf = async () =>
      (await listBranchVacancies(head.id)).find((each) => each.id === branch.id)?.roles;

    await setPrincipalStep(false);
    expect(await rolesOf()).toEqual(["MANAGER"]);
    await setPrincipalStep(true);
    expect(await rolesOf()).toEqual(["MANAGER", "PRINCIPAL"]);
  });

  it("deactivating a branch's Principal tells the Head with the step on, and not with it off", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const head = await insertUser("HEAD");
    const vacated = async (on: boolean) => {
      await setPrincipalStep(on);
      const branch = await insertBranch();
      await insertUser("MANAGER", { branches: [branch.id] });
      await insertUser("FINANCE", { branches: [branch.id] });
      const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
      expect(
        await runAction(setUserActive, head.id, { id: principal.id, active: false }),
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
    expect(await vacated(true)).toEqual([
      { params: expect.objectContaining({ role: "PRINCIPAL" }) },
    ]);
    expect(await vacated(false)).toEqual([]);
    await setPrincipalStep(true);
  });
});

describe("the database guards of 0060 (developer-rules.md rule 5; D39; plan of 4.10d, decided item 6, Look first)", () => {
  async function refused(statement: PromiseLike<unknown>, constraint: string) {
    expect(await refusalOf(statement)).toEqual(
      expect.objectContaining({ code: "23514", constraint }),
    );
  }

  it("orders_skipped_principal_status_check: a marked order is never Waiting for Principal, on insert or update; an unmarked one beside it is", async () => {
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [branch.id] });
    const marked = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PENDING_FINANCE",
    });
    const plain = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PENDING_FINANCE",
    });
    await db.execute(sql`update orders set skipped_principal = true where id = ${marked.id}`);

    await refused(
      db.execute(sql`update orders set status = 'PENDING_PRINCIPAL' where id = ${marked.id}`),
      "orders_skipped_principal_status_check",
    );
    await db.execute(sql`update orders set status = 'PENDING_PRINCIPAL' where id = ${plain.id}`);
    // Insert: a copy of the unmarked row, marked and Waiting for Principal.
    await refused(
      db.execute(sql`
        insert into orders (branch_id, owner_id, created_by, status, number, variant_id,
                            department_id, planned_qty, planned_price, planned_total,
                            payment_type, priority, version, revision, submitted_at, progress,
                            skipped_principal, created_at, updated_at)
        select branch_id, owner_id, created_by, 'PENDING_PRINCIPAL', number || '9', variant_id,
               department_id, planned_qty, planned_price, planned_total, payment_type, priority,
               1, 1, submitted_at, progress, true, created_at, updated_at
        from orders where id = ${plain.id}`),
      "orders_skipped_principal_status_check",
    );
    const stored = await db
      .select({ status: orders.status })
      .from(orders)
      .where(inArray(orders.id, [marked.id, plain.id]));
    expect(stored.map((row) => row.status).sort()).toEqual([
      "PENDING_FINANCE",
      "PENDING_PRINCIPAL",
    ]);
    await setOrderStatus(plain.id, "REJECTED");
    await setOrderStatus(marked.id, "REJECTED");
  });

  it("settings_principal_step_check: only a boolean, on insert and on update", async () => {
    await db.delete(settings).where(eq(settings.key, "principal_step"));
    await refused(
      db.execute(
        sql`insert into settings (key, value, created_at) values ('principal_step', '"off"'::jsonb, now())`,
      ),
      "settings_principal_step_check",
    );
    await setPrincipalStep(true);
    await refused(
      db.execute(sql`update settings set value = '1'::jsonb where key = 'principal_step'`),
      "settings_principal_step_check",
    );
    expect(await storedStep()).toBe(true);
  });
});
