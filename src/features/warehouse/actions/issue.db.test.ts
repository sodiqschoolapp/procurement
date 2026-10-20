import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { type IssueInput, issueStock } from "./issue";

// Issue to a department (build plan 5.4; plan of 5.4, Tests). Spec: 09-warehouse.md (Issue to a
// department: fields, 1 and 2; Stock value: an issue leaves at the average); edge-cases/
// warehouse.md ("Half a piece is typed for an item counted in pieces"); developer-rules.md rules
// 3 and 8; 04-catalogs.md rule 2. Every fixture is asserted (D38); every refusal carries the stock
// of another branch beside it, untouched (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let manager: string;
let department: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  manager = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  department = (await insertDepartment(branch.id, { responsibleName: "Sinov Mas'ul" })).id;
});

async function goods(allowDecimal = false): Promise<string> {
  const unit = await insertUnit({ allowDecimal });
  return (await insertProduct({ unitId: unit.id })).defaultVariantId;
}

async function stock(branchId: string, variantId: string, qty: string, unitCost: bigint) {
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

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function documentCount(): Promise<number> {
  const found = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from stock_documents where branch_id = ${branch.id}`,
  );
  return found.rows[0]!.n;
}

function issueInput(lines: IssueInput["lines"], change: Partial<IssueInput> = {}): IssueInput {
  return {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    departmentId: department,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: null,
    lines,
    ...change,
  };
}

describe("issueStock (09 Issue to a department)", () => {
  it("writes the document, its lines and the movements at the average, numbered ISS-<code>-31-0001", async () => {
    const a = await goods();
    const b = await goods();
    await stock(branch.id, a, "10", 1000n);
    await stock(branch.id, a, "10", 2000n); // 20 @ 1 500
    await stock(branch.id, b, "4", 700n);
    await stock(other.id, a, "10", 1000n);

    const result = await runAction(
      issueStock,
      manager,
      issueInput(
        [
          { variantId: a, qty: "3" },
          { variantId: b, qty: "4" },
        ],
        { comment: "Sinov izoh" },
      ),
    );
    expect(result).toEqual({
      ok: true,
      data: { documentId: expect.any(String), number: `ISS-${branch.code}-31-0001` },
    });
    const id = result.ok ? result.data.documentId : "";

    const document = await db.execute<Record<string, string | null>>(sql`
      select type, status, department_id, received_by_name, doc_date::text as doc_date, comment,
        created_by, reason, to_branch_id
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({
      type: "ISSUE",
      status: "POSTED",
      department_id: department,
      received_by_name: "Sinov Qabulqiluvchi",
      doc_date: "2031-05-03",
      comment: "Sinov izoh",
      created_by: manager,
      reason: null,
      to_branch_id: null,
    });
    const movements = await db.execute<{
      variant_id: string;
      qty_delta: string;
      unit_cost: string;
    }>(
      sql`
      select m.variant_id, m.qty_delta::text as qty_delta, m.unit_cost::text as unit_cost
      from stock_movements m join stock_document_lines l on l.id = m.document_line_id
      where l.document_id = ${id} and m.type = 'ISSUE' order by m.variant_id = ${a} desc`,
    );
    expect(movements.rows).toEqual([
      { variant_id: a, qty_delta: "-3.000", unit_cost: "1500" },
      { variant_id: b, qty_delta: "-4.000", unit_cost: "700" },
    ]);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "17.000", avg_cost: "1500" });
    // 09 Stock value: at 0 the average resets.
    expect(await balanceOf(branch.id, b)).toEqual({ qty: "0.000", avg_cost: "0" });
    expect(await balanceOf(other.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
  });

  it("returns the first result for the same browser id twice (developer-rules.md rule 8)", async () => {
    const a = await goods();
    await stock(branch.id, a, "10", 1000n);
    const sent = issueInput([{ variantId: a, qty: "3" }]);
    const first = await runAction(issueStock, manager, sent);
    const again = await runAction(issueStock, manager, sent);
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "7.000", avg_cost: "1000" });
    expect(await documentCount()).toBe(1);
  });

  it("refuses one past the stock under the lock, names the line and the amount left, saves nothing (09 Issue 1)", async () => {
    const a = await goods();
    const b = await goods();
    await stock(branch.id, a, "10", 1000n);
    await stock(branch.id, b, "4", 1000n);
    await stock(other.id, b, "50", 1000n);

    const result = await runAction(
      issueStock,
      manager,
      issueInput([
        { variantId: a, qty: "2" },
        { variantId: b, qty: "5" },
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "lines.1.qty": "errors.field.stockShort" },
        available: { "lines.1.qty": "4" },
      },
    });
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, b)).toEqual({ qty: "4.000", avg_cost: "1000" });
    expect(await balanceOf(other.id, b)).toEqual({ qty: "50.000", avg_cost: "1000" });
    expect(await documentCount()).toBe(0);
  });

  it("refuses an item never stocked in the branch with 0 left, though another branch holds it", async () => {
    const a = await goods();
    await stock(other.id, a, "10", 1000n);
    const result = await runAction(issueStock, manager, issueInput([{ variantId: a, qty: "1" }]));
    expect(result.ok ? null : result.error.available).toEqual({ "lines.0.qty": "0" });
    expect(await balanceOf(other.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
  });

  it("allows the whole stock and today's date; refuses tomorrow (09 Issue: not in the future)", async () => {
    const a = await goods();
    await stock(branch.id, a, "5", 1000n);
    const tomorrow = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: a, qty: "5" }], { docDate: "2031-05-04" }),
    );
    expect(tomorrow.ok ? null : tomorrow.error.fields).toEqual({
      docDate: "errors.field.inFuture",
    });
    const yesterday = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: a, qty: "5" }], { docDate: "2031-05-02" }),
    );
    expect(yesterday.ok).toBe(true);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it('refuses half a piece and takes 0.5 kg (edge case "Half a piece")', async () => {
    const pieces = await goods(false);
    const kilos = await goods(true);
    await stock(branch.id, pieces, "5", 1000n);
    await stock(branch.id, kilos, "5", 1000n);
    const half = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: pieces, qty: "0.5" }]),
    );
    expect(half.ok ? null : half.error.fields).toEqual({ "lines.0.qty": "errors.field.wholeOnly" });
    const kilo = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: kilos, qty: "0.5" }]),
    );
    expect(kilo.ok).toBe(true);
    expect(await balanceOf(branch.id, pieces)).toEqual({ qty: "5.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, kilos)).toEqual({ qty: "4.500", avg_cost: "1000" });
  });

  it("refuses a department of another branch and an inactive one; takes an active one of the branch", async () => {
    const a = await goods();
    await stock(branch.id, a, "5", 1000n);
    const elsewhere = (await insertDepartment(other.id)).id;
    const closed = (await insertDepartment(branch.id, { isActive: false })).id;
    const wrong = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: a, qty: "1" }], { departmentId: elsewhere }),
    );
    expect(wrong.ok ? null : wrong.error.fields).toEqual({
      departmentId: "errors.field.notAllowed",
    });
    const inactive = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: a, qty: "1" }], { departmentId: closed }),
    );
    expect(inactive.ok ? null : inactive.error.fields).toEqual({
      departmentId: "errors.field.inactive",
    });
    expect(await documentCount()).toBe(0);
    expect(
      (await runAction(issueStock, manager, issueInput([{ variantId: a, qty: "1" }]))).ok,
    ).toBe(true);
  });

  // An inactive subtype is issued up to the stock held since D55 (3): inactive-stock.db.test.ts.
  it("refuses a service and a subtype twice (A7; plan decided item 7)", async () => {
    const product = await insertProduct({ unitId: (await insertUnit()).id });
    const [kept] = await insertSubtypes(product.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    await stock(branch.id, kept!, "5", 1000n);
    const service = (await insertProduct({ type: "SERVICE" })).defaultVariantId;

    const serviced = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: service, qty: "1" }]),
    );
    expect(serviced.ok ? null : serviced.error.fields).toEqual({
      "lines.0.variantId": "errors.field.notAllowed",
    });
    const twice = await runAction(
      issueStock,
      manager,
      issueInput([
        { variantId: kept!, qty: "1" },
        { variantId: kept!, qty: "1" },
      ]),
    );
    expect(twice.ok ? null : twice.error.code).toBe("invalid_input");
    expect(await documentCount()).toBe(0);
    expect(await balanceOf(branch.id, kept!)).toEqual({ qty: "5.000", avg_cost: "1000" });
  });

  it("refuses an inactive branch (decided item 13) and a blank receiver (decided item 4)", async () => {
    const a = await goods();
    await stock(branch.id, a, "5", 1000n);
    const blank = await runAction(
      issueStock,
      manager,
      issueInput([{ variantId: a, qty: "1" }], { receivedByName: "   " }),
    );
    expect(blank.ok ? null : blank.error.fields).toHaveProperty("receivedByName");
    await db.execute(sql`update branches set is_active = false where id = ${branch.id}`);
    const head = (await insertUser("HEAD")).id;
    const closed = await runAction(issueStock, head, issueInput([{ variantId: a, qty: "1" }]));
    expect(closed.ok ? null : closed.error.fields).toEqual({
      branchId: "errors.field.branchInactive",
    });
    expect(await documentCount()).toBe(0);
  });
});
