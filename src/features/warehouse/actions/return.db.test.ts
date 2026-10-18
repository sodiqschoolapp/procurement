import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { reverseDocument } from "@/server/stock-documents";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";
import { type ReturnInput, returnStock } from "./return";

// Return from a department (build plan 5.6; plan of 5.6, Tests). Spec: 09-warehouse.md (Other
// documents: "Pick the department, items and quantities; stock goes up. Returning more than that
// department ever received shows a warning and needs a comment"; Stock value); Decided ahead,
// question 11; edge-cases/warehouse.md ("Half a piece"); developer-rules.md rules 3 and 8;
// 04-catalogs.md rule 2. Every fixture is asserted (D38); the rows that must not count stand
// beside the ones that do (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let manager: string;
let department: string;
let neighbour: string;
let away: string;
let otherManager: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  manager = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  otherManager = (await insertUser("MANAGER", { branches: [other.id] })).id;
  department = (await insertDepartment(branch.id)).id;
  neighbour = (await insertDepartment(branch.id)).id;
  away = (await insertDepartment(other.id)).id;
});

async function goods(allowDecimal = false): Promise<string> {
  const unit = await insertUnit({ allowDecimal });
  return (await insertProduct({ unitId: unit.id })).defaultVariantId;
}

async function receive(branchId: string, variantId: string, qty: string, unitCost: bigint) {
  const posted = await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost,
      createdBy: manager,
    }),
  );
  expect(Number(posted.qty)).toBeGreaterThanOrEqual(Number(qty));
}

async function issue(
  variantId: string,
  qty: string,
  options: { to?: string; branchId?: string; by?: string } = {},
): Promise<string> {
  const result = await runAction(issueStock, options.by ?? manager, {
    clientKey: randomUUID(),
    branchId: options.branchId ?? branch.id,
    docDate: "2031-05-03",
    departmentId: options.to ?? department,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: null,
    lines: [{ variantId, qty }],
  });
  expect(result.ok).toBe(true);
  return result.ok ? result.data.documentId : "";
}

async function reverse(documentId: string) {
  await db.transaction((tx) =>
    reverseDocument(tx, { documentId, reason: "Sinov sababi", reversedBy: manager }),
  );
}

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function returnCount(): Promise<number> {
  const found = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from stock_documents where type = 'RETURN' and branch_id = ${branch.id}`,
  );
  return found.rows[0]!.n;
}

async function returnMovements(documentId: string) {
  const found = await db.execute<{ variant_id: string; qty_delta: string; unit_cost: string }>(sql`
    select m.variant_id, m.qty_delta::text as qty_delta, m.unit_cost::text as unit_cost
    from stock_movements m join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${documentId} and m.type = 'RETURN' order by m.seq`);
  return found.rows;
}

function returnInput(lines: ReturnInput["lines"], change: Partial<ReturnInput> = {}): ReturnInput {
  return {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    departmentId: department,
    comment: null,
    lines,
    ...change,
  };
}

/** The over-return refusal names this amount as what the department received, or null. */
async function receivedShown(variantId: string, qty = "1000"): Promise<string | null> {
  const result = await runAction(
    returnStock,
    manager,
    returnInput([{ variantId, qty }]),
  );
  expect(result.ok).toBe(false);
  return result.ok ? null : (result.error.available?.["lines.0.qty"] ?? null);
}

describe("returnStock (09 Other documents, Return from a department)", () => {
  it("raises the stock at the average, the average unchanged, numbered RET-<code>-31-0001 (Done when 1; Decided ahead 11)", async () => {
    const a = await goods();
    const b = await goods();
    await receive(branch.id, a, "10", 1000n);
    await receive(branch.id, a, "10", 2000n); // 20 @ 1 500
    await receive(branch.id, b, "6", 700n);
    await receive(other.id, a, "10", 1000n);
    await issue(a, "5");
    await issue(b, "2");

    const result = await runAction(
      returnStock,
      manager,
      returnInput([
        { variantId: a, qty: "3" },
        { variantId: b, qty: "2" },
      ]),
    );
    expect(result).toEqual({
      ok: true,
      data: { documentId: expect.any(String), number: `RET-${branch.code}-31-0001` },
    });
    const id = result.ok ? result.data.documentId : "";

    const document = await db.execute<Record<string, string | null>>(sql`
      select type, status, department_id, received_by_name, doc_date::text as doc_date, comment,
        created_by, reason, to_branch_id
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({
      type: "RETURN",
      status: "POSTED",
      department_id: department,
      received_by_name: null,
      doc_date: "2031-05-03",
      comment: null,
      created_by: manager,
      reason: null,
      to_branch_id: null,
    });
    expect(await returnMovements(id)).toEqual(
      expect.arrayContaining([
        { variant_id: a, qty_delta: "3.000", unit_cost: "1500" },
        { variant_id: b, qty_delta: "2.000", unit_cost: "700" },
      ]),
    );
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "18.000", avg_cost: "1500" });
    expect(await balanceOf(branch.id, b)).toEqual({ qty: "6.000", avg_cost: "700" });
    expect(await balanceOf(other.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
  });

  it("refuses an over-return without a comment, names each line over with the amount received, saves nothing (Done when 2)", async () => {
    const a = await goods();
    const b = await goods();
    await receive(branch.id, a, "10", 1000n);
    await receive(branch.id, b, "10", 1000n);
    await issue(a, "4");
    await issue(b, "4");

    const result = await runAction(
      returnStock,
      manager,
      returnInput([
        { variantId: a, qty: "4" },
        { variantId: b, qty: "5" },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: {
          "lines.1.qty": "errors.field.overReturn",
          comment: "errors.field.overReturnComment",
        },
        available: { "lines.1.qty": "4.000" },
      },
    });
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "6.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, b)).toEqual({ qty: "6.000", avg_cost: "1000" });
    expect(await returnCount()).toBe(0);
  });

  it("posts the same over-return with a comment (09: it needs a comment)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "2");
    const result = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "3" }], { comment: "Sinov: boshqa xonadan topildi" }),
    );
    expect(result.ok).toBe(true);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "11.000", avg_cost: "1000" });
  });

  it("allows exactly the amount received without a comment", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "4");
    const result = await runAction(returnStock, manager, returnInput([{ variantId: a, qty: "4" }]));
    expect(result.ok).toBe(true);
  });

  it("counts the department's net received amount: issued − reversed issues − its earlier returns (decided item 2, Look first)", async () => {
    const a = await goods();
    const b = await goods();
    await receive(branch.id, a, "100", 1000n);
    await receive(branch.id, b, "100", 1000n);
    await receive(other.id, a, "100", 1000n);
    // Counted: two issues of 10 and 5, and a return of 3.
    await issue(a, "10");
    await issue(a, "5");
    const back = await runAction(returnStock, manager, returnInput([{ variantId: a, qty: "3" }]));
    expect(back.ok).toBe(true);
    // Not counted: an issue reversed, a return reversed, another department of the branch, the
    // other branch, another subtype.
    await reverse(await issue(a, "7"));
    const undone = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "2" }]),
    );
    expect(undone.ok).toBe(true);
    await reverse(undone.ok ? undone.data.documentId : "");
    await issue(a, "20", { to: neighbour });
    await issue(a, "30", { to: away, branchId: other.id, by: otherManager });
    await issue(b, "40");

    // 10 + 5 − 3 = 12.
    expect(await receivedShown(a)).toBe("12.000");
    const twelve = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "12" }]),
    );
    expect(twelve.ok).toBe(true);
    expect(await receivedShown(a, "1")).toBe("0.000");
  });

  it("counts a department that returned more than it got below 0", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "1");
    const over = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "3" }], { comment: "Sinov izoh" }),
    );
    expect(over.ok).toBe(true);
    expect(await receivedShown(a)).toBe("-2.000");
  });

  it("into an empty stock comes in at the department's newest issue cost that no reversal undid (decided item 1, Look first)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "10"); // to the department at 1 000; the stock is 0 at 0
    await receive(branch.id, a, "10", 3000n);
    await issue(a, "10", { to: neighbour }); // a newer issue of another department at 3 000
    await receive(branch.id, a, "5", 5000n);
    await reverse(await issue(a, "5")); // a newer issue of the department, reversed: not taken
    await receive(other.id, a, "5", 9000n);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "5.000", avg_cost: "5000" });
    // Empty the stock with an issue to the neighbour at 5 000, newer still.
    await issue(a, "5", { to: neighbour });
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "0.000", avg_cost: "0" });

    const result = await runAction(returnStock, manager, returnInput([{ variantId: a, qty: "4" }]));
    expect(result.ok).toBe(true);
    const id = result.ok ? result.data.documentId : "";
    expect(await returnMovements(id)).toEqual([
      { variant_id: a, qty_delta: "4.000", unit_cost: "1000" },
    ]);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "4.000", avg_cost: "1000" });
    const line = await db.execute<{ unit_cost: string }>(
      sql`select unit_cost::text as unit_cost from stock_document_lines where document_id = ${id}`,
    );
    expect(line.rows).toEqual([{ unit_cost: "1000" }]);
  });

  it("into an empty stock with no issue to the department comes in at 0", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "10", { to: neighbour });
    const result = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "1" }], { comment: "Sinov izoh" }),
    );
    expect(result.ok).toBe(true);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "1.000", avg_cost: "0" });
  });

  it("into a stock above 0 comes in at the average, the issue cost unused (Decided ahead 11)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "5"); // at 1 000
    await receive(branch.id, a, "5", 3000n); // 10 @ 2 000
    const result = await runAction(returnStock, manager, returnInput([{ variantId: a, qty: "2" }]));
    expect(result.ok).toBe(true);
    expect(await returnMovements(result.ok ? result.data.documentId : "")).toEqual([
      { variant_id: a, qty_delta: "2.000", unit_cost: "2000" },
    ]);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "12.000", avg_cost: "2000" });
  });

  it("returns the first result for the same browser id twice (developer-rules.md rule 8)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "5");
    const sent = returnInput([{ variantId: a, qty: "2" }]);
    const first = await runAction(returnStock, manager, sent);
    const again = await runAction(returnStock, manager, sent);
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "7.000", avg_cost: "1000" });
    expect(await returnCount()).toBe(1);
  });

  it("refuses tomorrow, allows today (decided item 6)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    await issue(a, "5");
    const tomorrow = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "1" }], { docDate: "2031-05-04" }),
    );
    expect(tomorrow.ok ? null : tomorrow.error.fields).toEqual({
      docDate: "errors.field.inFuture",
    });
    expect(await returnCount()).toBe(0);
  });

  it("refuses an inactive or another branch's department (decided item 8; 04 rule 2)", async () => {
    const a = await goods();
    await receive(branch.id, a, "10", 1000n);
    const closed = (await insertDepartment(branch.id, { isActive: false })).id;
    const inactive = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "1" }], { departmentId: closed, comment: "Sinov izoh" }),
    );
    expect(inactive.ok ? null : inactive.error.fields).toEqual({
      departmentId: "errors.field.inactive",
    });
    const foreign = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "1" }], { departmentId: away, comment: "Sinov izoh" }),
    );
    expect(foreign.ok ? null : foreign.error.fields).toEqual({
      departmentId: "errors.field.notAllowed",
    });
    expect(await returnCount()).toBe(0);
  });

  it("refuses an inactive branch", async () => {
    const a = await goods();
    await db.execute(sql`update branches set is_active = false where id = ${branch.id}`);
    const result = await runAction(
      returnStock,
      manager,
      returnInput([{ variantId: a, qty: "1" }], { comment: "Sinov izoh" }),
    );
    expect(result.ok ? null : result.error.fields).toEqual({
      branchId: "errors.field.branchInactive",
    });
  });

  it("refuses a service, an inactive subtype and half a piece (A7; 04 rule 2; edge case \"Half a piece\")", async () => {
    const service = (await insertProduct({ type: "SERVICE" })).defaultVariantId;
    const product = await insertProduct();
    const [, old] = await insertSubtypes(product.id, [
      { name: "Yangi" },
      { name: "Eski", isActive: false },
    ]);
    const pieces = await goods(false);
    const cases = [
      { variantId: service, qty: "1", field: "lines.0.variantId", kind: "errors.field.notAllowed" },
      { variantId: old!, qty: "1", field: "lines.0.variantId", kind: "errors.field.inactive" },
      { variantId: pieces, qty: "0.5", field: "lines.0.qty", kind: "errors.field.wholeOnly" },
    ];
    for (const each of cases) {
      const result = await runAction(
        returnStock,
        manager,
        returnInput([{ variantId: each.variantId, qty: each.qty }], { comment: "Sinov izoh" }),
      );
      expect(result.ok ? null : result.error.fields).toEqual({ [each.field]: each.kind });
    }
    expect(await returnCount()).toBe(0);
  });

  it("allows decimals where the measure does", async () => {
    const kg = await goods(true);
    await receive(branch.id, kg, "5", 4000n);
    await issue(kg, "2.5");
    const result = await runAction(returnStock, manager, returnInput([{ variantId: kg, qty: "1.25" }]));
    expect(result.ok).toBe(true);
    expect(await balanceOf(branch.id, kg)).toEqual({ qty: "3.750", avg_cost: "4000" });
  });
});
