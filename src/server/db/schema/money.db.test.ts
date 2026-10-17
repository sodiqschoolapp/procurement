import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints, keys and triggers of migration 0028_money (build plan 4.1; plan of 4.1, Tests).
// Each forbidden write goes straight to the table with nothing in front (D39) and stands beside
// the write the guard lets through (D40). Spec: 14-data-model.md (Purchasing and money);
// 08-money-and-settlement.md (Money ledger; Closing 2; Overspend guard); developer-rules.md rules
// 5, 7 and 8; docs/decisions.md, Decided ahead, question 3.

const AT = "2031-05-02T05:00:00Z";
const CHECK = "23514";
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";
const ENUM = "22P02";

let branchId: string;
let managerId: string;
let otherManagerId: string;
let financeId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  managerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
  otherManagerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
  financeId = (await insertUser("FINANCE", { branches: [branchId] })).id;
});

async function action(row: Partial<Parameters<typeof insertMoneyAction>[0]> = {}) {
  const inserted = await insertMoneyAction({ managerId, createdBy: financeId, ...row });
  return inserted.rows[0]!.id;
}

function openOrder(ownerId = managerId) {
  // Every order of a test is of one branch and created by the same user, so only the owner tells
  // two of them apart (D40).
  return insertOrder({ branchId, ownerId, createdBy: managerId, status: "PURCHASING" });
}

function cancelAction(id: string, reason = "Xato summa") {
  return db.execute(sql`update money_actions set is_cancelled = true, cancel_reason = ${reason},
      cancelled_by = ${financeId}, cancelled_at = ${AT} where id = ${id}`);
}

function insertActionWith(columns: string, values: string) {
  return db.execute(
    sql.raw(`insert into money_actions (client_key, manager_id, occurred_on, created_by,
      created_at, ${columns})
    values ('${randomUUID()}', '${managerId}', '2031-05-02', '${financeId}', '${AT}', ${values})`),
  );
}

describe("money_rows CHECK, enum and keys (14 money_rows; 08 Money ledger)", () => {
  it("money_rows_amount_check refuses 0 and −1; 1 passes (build plan 4.3, Done when: an amount of 0 is refused by the database)", async () => {
    const actionId = await action();
    for (const amount of ["0", "-1"]) {
      const order = await openOrder();
      expect(
        await refusalOf(insertMoneyRow({ moneyActionId: actionId, orderId: order.id, amount })),
      ).toMatchObject({ code: CHECK, constraint: "money_rows_amount_check" });
    }
    const order = await openOrder();
    await insertMoneyRow({ moneyActionId: actionId, orderId: order.id, amount: "1" });
  });

  it("the kind is one of the six of 08's table; another is refused by the enum", async () => {
    const actionId = await action();
    expect(
      await refusalOf(
        insertMoneyRow({ moneyActionId: actionId, orderId: (await openOrder()).id, kind: "GIFT" }),
      ),
    ).toMatchObject({ code: ENUM });
    for (const kind of [
      "CASH_GIVEN",
      "CASH_RETURNED",
      "PAID_BACK",
      "BANK_TRANSFER",
      "CARD_TOPUP",
      "CARD_RETURNED",
    ]) {
      await insertMoneyRow({ moneyActionId: actionId, orderId: (await openOrder()).id, kind });
    }
  });

  it("money_rows_action_order_key: one row per order in an action (decided item 3)", async () => {
    const actionId = await action();
    const order = await openOrder();
    await insertMoneyRow({ moneyActionId: actionId, orderId: order.id });
    expect(
      await refusalOf(
        insertMoneyRow({ moneyActionId: actionId, orderId: order.id, kind: "PAID_BACK" }),
      ),
    ).toMatchObject({ code: UNIQUE, constraint: "money_rows_action_order_key" });
    // The same order in another action passes.
    await insertMoneyRow({ moneyActionId: await action(), orderId: order.id });
  });

  it("money_rows foreign keys: an unknown action or order is refused", async () => {
    const actionId = await action();
    const order = await openOrder();
    expect(
      await refusalOf(insertMoneyRow({ moneyActionId: randomUUID(), orderId: order.id })),
    ).toMatchObject({
      code: FOREIGN_KEY,
      constraint: "money_rows_money_action_id_money_actions_id_fk",
    });
    expect(
      await refusalOf(insertMoneyRow({ moneyActionId: actionId, orderId: randomUUID() })),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "money_rows_order_id_orders_id_fk" });
  });
});

describe("money_rows_one_manager (08 Money ledger 1; plan of 4.1, decided item 4, Look first)", () => {
  it("a row on an order of another owner is refused; the Manager's own order beside it passes (build plan 4.3, Done when: an action whose rows cover orders of two Managers is refused)", async () => {
    const actionId = await action();
    const own = await openOrder(managerId);
    const others = await openOrder(otherManagerId);
    expect(
      await refusalOf(insertMoneyRow({ moneyActionId: actionId, orderId: others.id })),
    ).toMatchObject({ code: CHECK, constraint: "money_rows_one_manager" });
    await insertMoneyRow({ moneyActionId: actionId, orderId: own.id });
    // The other Manager's own action takes that order.
    await insertMoneyRow({
      moneyActionId: await action({ managerId: otherManagerId }),
      orderId: others.id,
    });
  });
});

describe("money_rows are append-only (developer-rules rule 7)", () => {
  it("UPDATE, DELETE and TRUNCATE are refused", async () => {
    const actionId = await action();
    const row = await insertMoneyRow({ moneyActionId: actionId, orderId: (await openOrder()).id });
    const id = row.rows[0]!.id;
    const constraint = { code: CHECK, constraint: "money_rows_append_only" };
    expect(
      await refusalOf(db.execute(sql`update money_rows set amount = 1 where id = ${id}`)),
    ).toMatchObject(constraint);
    expect(await refusalOf(db.execute(sql`delete from money_rows where id = ${id}`))).toMatchObject(
      constraint,
    );
    expect(await refusalOf(db.execute(sql`truncate money_rows cascade`))).toMatchObject(constraint);
  });
});

describe("money_actions CHECKs and keys (14 money_actions; 08 Money ledger)", () => {
  it("money_actions_client_key_manager_key: one browser id saves one action per Manager (14)", async () => {
    const clientKey = randomUUID();
    await action({ clientKey });
    expect(
      await refusalOf(insertMoneyAction({ managerId, createdBy: financeId, clientKey })),
    ).toMatchObject({ code: UNIQUE, constraint: "money_actions_client_key_manager_key" });
    await action({ clientKey, managerId: otherManagerId });
  });

  it("money_actions_file_id_key: a file has one holder", async () => {
    const fileId = (await insertFileRow(financeId, "application/pdf")).id;
    await action({ fileId });
    expect(
      await refusalOf(insertMoneyAction({ managerId, createdBy: financeId, fileId })),
    ).toMatchObject({ code: UNIQUE, constraint: "money_actions_file_id_key" });
  });

  it("money_actions_document_no_check refuses 101 characters; 100 pass", async () => {
    expect(
      await refusalOf(
        insertMoneyAction({ managerId, createdBy: financeId, documentNo: "a".repeat(101) }),
      ),
    ).toMatchObject({ code: CHECK, constraint: "money_actions_document_no_check" });
    await action({ documentNo: "a".repeat(100) });
  });

  it("money_actions_comment_check refuses 1 001 characters; 1 000 and none pass (decided item 9)", async () => {
    expect(
      await refusalOf(
        insertMoneyAction({ managerId, createdBy: financeId, comment: "a".repeat(1001) }),
      ),
    ).toMatchObject({ code: CHECK, constraint: "money_actions_comment_check" });
    await action({ comment: "a".repeat(1000) });
    await action({ comment: null });
  });

  it("money_actions_cancel_check: the cancel fields are all empty, or all filled with a reason", async () => {
    const constraint = { code: CHECK, constraint: "money_actions_cancel_check" };
    const refused: [string, string][] = [
      // Not cancelled, yet a field is set: the ELSE branch.
      ["cancel_reason", `'Xato'`],
      ["cancelled_by", `'${financeId}'`],
      ["cancelled_at", `'${AT}'`],
      // Cancelled, yet a field is missing or the reason is blank: the THEN branch.
      ["is_cancelled, cancel_reason, cancelled_by", `true, 'Xato', '${financeId}'`],
      ["is_cancelled, cancelled_by, cancelled_at", `true, '${financeId}', '${AT}'`],
      ["is_cancelled, cancel_reason, cancelled_at", `true, 'Xato', '${AT}'`],
      [
        "is_cancelled, cancel_reason, cancelled_by, cancelled_at",
        `true, '   ', '${financeId}', '${AT}'`,
      ],
    ];
    for (const [columns, values] of refused) {
      expect(await refusalOf(insertActionWith(columns, values))).toMatchObject(constraint);
    }
    // On update: the trigger lets a false → true change through, and the CHECK then refuses it.
    const id = await action();
    expect(
      await refusalOf(
        db.execute(sql`update money_actions set is_cancelled = true, cancel_reason = '  ',
          cancelled_by = ${financeId}, cancelled_at = ${AT} where id = ${id}`),
      ),
    ).toMatchObject(constraint);
    await insertActionWith(
      "is_cancelled, cancel_reason, cancelled_by, cancelled_at",
      `true, 'Xato', '${financeId}', '${AT}'`,
    );
  });

  it("money_actions foreign keys: each unknown id is refused", async () => {
    const cases: [string, string, string][] = [
      ["order_action_id", `'${randomUUID()}'`, "money_actions_order_action_id_order_actions_id_fk"],
      ["supplier_id", `'${randomUUID()}'`, "money_actions_supplier_id_companies_id_fk"],
      ["file_id", `'${randomUUID()}'`, "money_actions_file_id_files_id_fk"],
      [
        "is_cancelled, cancel_reason, cancelled_at, cancelled_by",
        `true, 'Xato', '${AT}', '${randomUUID()}'`,
        "money_actions_cancelled_by_users_id_fk",
      ],
    ];
    for (const [columns, values, constraint] of cases) {
      expect(await refusalOf(insertActionWith(columns, values))).toMatchObject({
        code: FOREIGN_KEY,
        constraint,
      });
    }
    expect(
      await refusalOf(insertMoneyAction({ managerId: randomUUID(), createdBy: financeId })),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "money_actions_manager_id_users_id_fk" });
    expect(
      await refusalOf(insertMoneyAction({ managerId, createdBy: randomUUID() })),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "money_actions_created_by_users_id_fk" });
  });
});

describe("money_actions_cancel_only (Decided ahead, question 3; developer-rules rule 7)", () => {
  const constraint = { code: CHECK, constraint: "money_actions_cancel_only" };

  it("the one cancel passes; a second cancel and an un-cancel are refused", async () => {
    const id = await action();
    await cancelAction(id);
    expect(await refusalOf(cancelAction(id, "Yana bir bor"))).toMatchObject(constraint);
    expect(
      await refusalOf(
        db.execute(sql`update money_actions set is_cancelled = false, cancel_reason = null,
          cancelled_by = null, cancelled_at = null where id = ${id}`),
      ),
    ).toMatchObject(constraint);
  });

  it("a change to any other column, alone or beside the cancel, is refused", async () => {
    const sets = [
      `comment = 'Boshqa'`,
      `occurred_on = '2031-05-03'`,
      `manager_id = '${otherManagerId}'`,
      `document_no = 'K-1'`,
      `is_cancelled = true, cancel_reason = 'Xato', cancelled_by = '${financeId}', cancelled_at = '${AT}', comment = 'Boshqa'`,
    ];
    for (const set of sets) {
      const id = await action();
      expect(
        await refusalOf(db.execute(sql.raw(`update money_actions set ${set} where id = '${id}'`))),
      ).toMatchObject(constraint);
    }
  });

  it("DELETE and TRUNCATE are refused", async () => {
    const id = await action();
    expect(
      await refusalOf(db.execute(sql`delete from money_actions where id = ${id}`)),
    ).toMatchObject(constraint);
    expect(await refusalOf(db.execute(sql`truncate money_actions cascade`))).toMatchObject(
      constraint,
    );
  });
});

describe("order_settlements CHECKs and keys (14 order_settlements; 08 Closing 2, Overspend guard)", () => {
  async function settlement(values: Record<string, string> = {}) {
    const order = await openOrder();
    const columns = ["order_id", "created_at", ...Object.keys(values)].join(", ");
    const given = [`'${order.id}'`, `'${AT}'`, ...Object.values(values)].join(", ");
    return {
      orderId: order.id,
      write: () =>
        db.execute(sql.raw(`insert into order_settlements (${columns}) values (${given})`)),
    };
  }

  function updateSettlement(orderId: string, set: string) {
    return db.execute(sql.raw(`update order_settlements set ${set} where order_id = '${orderId}'`));
  }

  const by = () => `'${financeId}'`;
  const at = `'${AT}'`;
  const pairs = [
    ["transfer_confirmed_by", "transfer_confirmed_at", "order_settlements_transfer_check"],
    ["card_confirmed_by", "card_confirmed_at", "order_settlements_card_check"],
  ] as const;

  for (const [byColumn, atColumn, constraint] of pairs) {
    it(`${constraint}: ${byColumn} and ${atColumn} together, on insert and on update`, async () => {
      for (const half of [{ [byColumn]: by() }, { [atColumn]: at }]) {
        expect(await refusalOf((await settlement(half)).write())).toMatchObject({
          code: CHECK,
          constraint,
        });
      }
      const empty = await settlement();
      await empty.write();
      for (const half of [`${byColumn} = ${by()}`, `${atColumn} = ${at}`]) {
        expect(await refusalOf(updateSettlement(empty.orderId, half))).toMatchObject({
          code: CHECK,
          constraint,
        });
      }
      await updateSettlement(empty.orderId, `${byColumn} = ${by()}, ${atColumn} = ${at}`);
      // The clearing update of a reopen (08 Overspend guard, last sentence) passes.
      await updateSettlement(empty.orderId, `${byColumn} = null, ${atColumn} = null`);
      await (await settlement({ [byColumn]: by(), [atColumn]: at })).write();
    });
  }

  it("order_settlements_ack_check: by, at and a non-blank comment together, on insert and on update", async () => {
    const constraint = { code: CHECK, constraint: "order_settlements_ack_check" };
    const refused: Record<string, string>[] = [
      { overspend_ack_by: by(), overspend_ack_at: at },
      { overspend_ack_by: by(), overspend_ack_at: at, overspend_ack_comment: "''" },
      { overspend_ack_by: by(), overspend_ack_at: at, overspend_ack_comment: "'   '" },
      { overspend_ack_by: by(), overspend_ack_comment: "'Sabab bor'" },
      { overspend_ack_at: at, overspend_ack_comment: "'Sabab bor'" },
      { overspend_ack_comment: "'Sabab bor'" },
      { overspend_ack_at: at },
    ];
    for (const values of refused) {
      expect(await refusalOf((await settlement(values)).write())).toMatchObject(constraint);
    }
    const empty = await settlement();
    await empty.write();
    for (const set of [
      `overspend_ack_by = ${by()}, overspend_ack_at = ${at}`,
      `overspend_ack_by = ${by()}, overspend_ack_at = ${at}, overspend_ack_comment = '  '`,
      `overspend_ack_comment = 'Sabab bor'`,
    ]) {
      expect(await refusalOf(updateSettlement(empty.orderId, set))).toMatchObject(constraint);
    }
    await updateSettlement(
      empty.orderId,
      `overspend_ack_by = ${by()}, overspend_ack_at = ${at}, overspend_ack_comment = 'Sabab bor'`,
    );
    await updateSettlement(
      empty.orderId,
      "overspend_ack_by = null, overspend_ack_at = null, overspend_ack_comment = null",
    );
  });

  it("order_settlements_transfer_note_check and _ack_comment_check refuse 1 001 characters; 1 000 pass", async () => {
    const long = `'${"a".repeat(1001)}'`;
    const full = `'${"a".repeat(1000)}'`;
    expect(await refusalOf((await settlement({ transfer_note: long })).write())).toMatchObject({
      code: CHECK,
      constraint: "order_settlements_transfer_note_check",
    });
    const ack = { overspend_ack_by: by(), overspend_ack_at: at };
    expect(
      await refusalOf((await settlement({ ...ack, overspend_ack_comment: long })).write()),
    ).toMatchObject({ code: CHECK, constraint: "order_settlements_ack_comment_check" });
    const row = await settlement({ transfer_note: full, ...ack, overspend_ack_comment: full });
    await row.write();
    expect(await refusalOf(updateSettlement(row.orderId, `transfer_note = ${long}`))).toMatchObject(
      { code: CHECK, constraint: "order_settlements_transfer_note_check" },
    );
    expect(
      await refusalOf(updateSettlement(row.orderId, `overspend_ack_comment = ${long}`)),
    ).toMatchObject({ code: CHECK, constraint: "order_settlements_ack_comment_check" });
  });

  it("order_settlements: one row per order (its key) and every foreign key", async () => {
    const row = await settlement();
    await row.write();
    expect(
      await refusalOf(
        db.execute(sql`insert into order_settlements (order_id, created_at)
          values (${row.orderId}, ${AT})`),
      ),
    ).toMatchObject({ code: UNIQUE, constraint: "order_settlements_pkey" });
    expect(
      await refusalOf(
        db.execute(sql`insert into order_settlements (order_id, created_at)
          values (${randomUUID()}, ${AT})`),
      ),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "order_settlements_order_id_orders_id_fk" });
    const unknown = `'${randomUUID()}'`;
    const cases: [Record<string, string>, string][] = [
      [
        { transfer_confirmed_by: unknown, transfer_confirmed_at: at },
        "order_settlements_transfer_confirmed_by_users_id_fk",
      ],
      [
        { card_confirmed_by: unknown, card_confirmed_at: at },
        "order_settlements_card_confirmed_by_users_id_fk",
      ],
      [
        { overspend_ack_by: unknown, overspend_ack_at: at, overspend_ack_comment: "'Sabab'" },
        "order_settlements_overspend_ack_by_users_id_fk",
      ],
    ];
    for (const [values, constraint] of cases) {
      expect(await refusalOf((await settlement(values)).write())).toMatchObject({
        code: FOREIGN_KEY,
        constraint,
      });
    }
  });
});
