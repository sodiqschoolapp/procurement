import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0033_stock_documents (build plan 5.1; plan of 5.1, Database
// changes and Tests). Each forbidden write goes straight to the table with nothing in front (D39),
// on insert and, where a status move could break it, on update, and stands beside the write the
// guard lets through (D40). Spec: 14-data-model.md (Warehouse: stock_documents,
// stock_document_lines, stock_movements); 09-warehouse.md (Movement types; Issue to a department;
// Direct entry; Other documents); developer-rules.md rules 5 and 7.

const AT = "2031-05-02T05:00:00Z";
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN = "23503";

let branchId: string;
let code: string;
let otherBranchId: string;
let userId: string;
let departmentId: string;
let otherDepartmentId: string;

beforeAll(async () => {
  const branch = await insertBranch();
  branchId = branch.id;
  code = branch.code;
  otherBranchId = (await insertBranch()).id;
  userId = (await insertUser("HEAD")).id;
  departmentId = (await insertDepartment(branchId)).id;
  otherDepartmentId = (await insertDepartment(otherBranchId)).id;
});

let counter = 0;

type Doc = {
  number?: string;
  type?: string;
  branch_id?: string;
  to_branch_id?: string | null;
  department_id?: string | null;
  status?: string;
  reason?: string | null;
  client_key?: string;
  decided_by?: string | null;
  decided_at?: string | null;
  reversed_by?: string | null;
  reversed_at?: string | null;
  reverse_reason?: string | null;
  decision_reason?: string | null;
};

const PREFIX: Record<string, string> = {
  ISSUE: "ISS",
  RETURN: "RET",
  TRANSFER: "TRF",
  WRITE_OFF: "WOF",
  COUNT: "CNT",
  DIRECT_ENTRY: "ENT",
};

/** A valid document of `type`, with `overrides` written over it. */
function document(type: string, overrides: Doc = {}): Required<Doc> {
  counter += 1;
  return {
    number: `${PREFIX[type]}-${code}-31-${String(counter).padStart(4, "0")}`,
    type,
    branch_id: branchId,
    to_branch_id: type === "TRANSFER" ? otherBranchId : null,
    department_id: type === "ISSUE" || type === "RETURN" ? departmentId : null,
    status: type === "TRANSFER" ? "IN_TRANSIT" : "POSTED",
    reason: type === "DIRECT_ENTRY" ? "GIFT" : type === "WRITE_OFF" ? "DAMAGED" : null,
    client_key: randomUUID(),
    decided_by: null,
    decided_at: null,
    reversed_by: null,
    reversed_at: null,
    reverse_reason: null,
    decision_reason: null,
    ...overrides,
  };
}

async function insertDocument(row: Required<Doc>): Promise<string> {
  const inserted = await db.execute<{ id: string }>(sql`
    insert into stock_documents (number, type, branch_id, to_branch_id, department_id, doc_date,
      status, reason, client_key, created_by, decided_by, decided_at, reversed_by, reversed_at,
      reverse_reason, decision_reason, created_at)
    values (${row.number}, ${row.type}, ${row.branch_id}, ${row.to_branch_id},
      ${row.department_id}, '2031-05-02', ${row.status}, ${row.reason}, ${row.client_key},
      ${userId}, ${row.decided_by}, ${row.decided_at}, ${row.reversed_by}, ${row.reversed_at},
      ${row.reverse_reason}, ${row.decision_reason}, ${AT})
    returning id`);
  return inserted.rows[0]!.id;
}

async function variant(): Promise<string> {
  return (await insertProduct()).defaultVariantId;
}

async function insertLine(
  documentId: string,
  variantId: string,
  values: {
    qty?: string;
    counted?: string | null;
    received?: string | null;
    cost?: string | null;
  } = {},
): Promise<string> {
  const inserted = await db.execute<{ id: string }>(sql`
    insert into stock_document_lines (document_id, variant_id, qty, counted_qty, received_qty,
      unit_cost, created_at)
    values (${documentId}, ${variantId}, ${values.qty ?? "1"}, ${values.counted ?? null},
      ${values.received ?? null}, ${values.cost ?? null}, ${AT})
    returning id`);
  return inserted.rows[0]!.id;
}

function update(documentId: string, set: ReturnType<typeof sql>) {
  return db.execute(sql`update stock_documents set ${set} where id = ${documentId}`);
}

describe("stock_documents: numbers and client keys (14 stock_documents; rules 5 and 8)", () => {
  it("accepts one document of each type in its own shape", async () => {
    for (const type of Object.keys(PREFIX)) {
      expect(await insertDocument(document(type))).toBeTruthy();
    }
  });

  it("refuses a number given twice (stock_documents.number UNIQUE)", async () => {
    const row = document("ISSUE");
    await insertDocument(row);
    expect(
      await refusalOf(insertDocument(document("ISSUE", { number: row.number }))),
    ).toMatchObject({ code: UNIQUE, constraint: "stock_documents_number_key" });
  });

  it("refuses a browser id given twice (developer-rules.md rule 8)", async () => {
    const row = document("ISSUE");
    await insertDocument(row);
    expect(
      await refusalOf(insertDocument(document("ISSUE", { client_key: row.client_key }))),
    ).toMatchObject({ code: UNIQUE, constraint: "stock_documents_client_key_key" });
  });

  it("refuses a number of another type's prefix or of the wrong shape (09 Issue 2)", async () => {
    for (const number of [
      `ENT-${code}-31-0901`,
      `ISS-${code}-31-91`,
      `ISS-chl-31-0901`,
      "ISS-0901",
    ]) {
      expect(await refusalOf(insertDocument(document("ISSUE", { number })))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_number_check",
      });
    }
    expect(
      await insertDocument(document("ISSUE", { number: `ISS-${code}-31-10000` })),
    ).toBeTruthy();
  });
});

describe("stock_documents: the shape of each type (09 Issue; Other documents; Direct entry)", () => {
  it("a transfer names another branch, every other type none", async () => {
    expect(
      await refusalOf(insertDocument(document("TRANSFER", { to_branch_id: null }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_to_branch_check" });
    expect(
      await refusalOf(insertDocument(document("TRANSFER", { to_branch_id: branchId }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_to_branch_check" });
    expect(
      await refusalOf(insertDocument(document("ISSUE", { to_branch_id: otherBranchId }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_to_branch_check" });
  });

  it("an issue and a return name a department, the other types none", async () => {
    expect(
      await refusalOf(insertDocument(document("RETURN", { department_id: null }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_department_check" });
    expect(
      await refusalOf(insertDocument(document("DIRECT_ENTRY", { department_id: departmentId }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_department_check" });
  });

  it("refuses a department of another branch (09 Issue: Department … from this branch)", async () => {
    expect(
      await refusalOf(insertDocument(document("ISSUE", { department_id: otherDepartmentId }))),
    ).toMatchObject({ code: FOREIGN, constraint: "stock_documents_department_branch_fk" });
  });

  it("takes a reason of its own list on a direct entry and a write-off, none elsewhere (decided item 3)", async () => {
    for (const reason of ["EXISTING_STOCK", "GIFT", "OTHER"]) {
      expect(await insertDocument(document("DIRECT_ENTRY", { reason }))).toBeTruthy();
    }
    for (const reason of [
      "DAMAGED",
      "EXPIRED",
      "LOST",
      "RETURNED_TO_SUPPLIER",
      "LOST_IN_TRANSFER",
      "OTHER",
    ]) {
      expect(await insertDocument(document("WRITE_OFF", { reason }))).toBeTruthy();
    }
    const refused: Array<[string, string | null]> = [
      ["DIRECT_ENTRY", "DAMAGED"],
      ["DIRECT_ENTRY", null],
      ["WRITE_OFF", "GIFT"],
      ["WRITE_OFF", null],
      ["ISSUE", "OTHER"],
    ];
    for (const [type, reason] of refused) {
      expect(await refusalOf(insertDocument(document(type, { reason })))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_reason_check",
      });
    }
  });

  it("refuses by update a reason the type does not allow", async () => {
    const id = await insertDocument(document("WRITE_OFF"));
    expect(await refusalOf(update(id, sql`reason = 'GIFT'`))).toMatchObject({
      code: CHECK,
      constraint: "stock_documents_reason_check",
    });
  });
});

describe("stock_documents: decided and reversed (plan of 5.1, decided item 1)", () => {
  it("sets decided_by and decided_at together, on insert and on update", async () => {
    expect(
      await refusalOf(insertDocument(document("WRITE_OFF", { decided_by: userId }))),
    ).toMatchObject({ code: CHECK, constraint: "stock_documents_decided_check" });
    const id = await insertDocument(document("WRITE_OFF", { status: "PENDING_APPROVAL" }));
    expect(await refusalOf(update(id, sql`status = 'POSTED', decided_at = ${AT}`))).toMatchObject({
      code: CHECK,
      constraint: "stock_documents_decided_check",
    });
    await update(id, sql`status = 'POSTED', decided_by = ${userId}, decided_at = ${AT}`);
  });

  it("is REVERSED exactly when who, when and a reason are there, on insert", async () => {
    const reversed = { reversed_by: userId, reversed_at: AT, reverse_reason: "Xato" };
    expect(
      await insertDocument(document("ISSUE", { status: "REVERSED", ...reversed })),
    ).toBeTruthy();
    for (const overrides of [
      { status: "REVERSED" },
      { status: "REVERSED", ...reversed, reverse_reason: "  " },
      { status: "REVERSED", ...reversed, reversed_at: null },
      { status: "POSTED", ...reversed },
    ]) {
      expect(await refusalOf(insertDocument(document("ISSUE", overrides)))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_reversed_check",
      });
    }
  });

  it("refuses by update REVERSED without the three, the three on a POSTED row, and a blank reason", async () => {
    const id = await insertDocument(document("ISSUE"));
    for (const set of [
      sql`status = 'REVERSED'`,
      sql`reversed_by = ${userId}, reversed_at = ${AT}, reverse_reason = 'Xato'`,
      sql`status = 'REVERSED', reversed_by = ${userId}, reversed_at = ${AT}, reverse_reason = ''`,
    ]) {
      expect(await refusalOf(update(id, set))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_reversed_check",
      });
    }
    await update(
      id,
      sql`status = 'REVERSED', reversed_by = ${userId}, reversed_at = ${AT}, reverse_reason = 'Xato'`,
    );
  });
});

describe("stock_documents_decision_reason_check (09 Other documents: a refusal and a cancel carry a reason; 14 decision_reason; plan of 7.4c, D39)", () => {
  it("on insert: REJECTED and CANCELLED with a reason pass; without one, with a blank one, or a reason on another status is refused", async () => {
    const by = { decided_by: userId, decided_at: AT };
    expect(
      await insertDocument(
        document("WRITE_OFF", { status: "REJECTED", ...by, decision_reason: "Sabab bor" }),
      ),
    ).toBeTruthy();
    expect(
      await insertDocument(
        document("TRANSFER", { status: "CANCELLED", ...by, decision_reason: "Sabab bor" }),
      ),
    ).toBeTruthy();
    for (const row of [
      document("WRITE_OFF", { status: "REJECTED", ...by }),
      document("COUNT", { status: "REJECTED", ...by, decision_reason: "   " }),
      document("TRANSFER", { status: "CANCELLED", ...by }),
      document("WRITE_OFF", { status: "POSTED", ...by, decision_reason: "Sabab bor" }),
      document("TRANSFER", { status: "IN_TRANSIT", decision_reason: "Sabab bor" }),
    ]) {
      expect(await refusalOf(insertDocument(row))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_decision_reason_check",
      });
    }
  });

  it("on update: a refusal or a cancel without a reason, with a blank one, and a reason on a POSTED row are refused", async () => {
    const writeOff = await insertDocument(document("WRITE_OFF", { status: "PENDING_APPROVAL" }));
    const transfer = await insertDocument(document("TRANSFER"));
    const posted = await insertDocument(document("ISSUE"));
    for (const [id, set] of [
      [writeOff, sql`status = 'REJECTED', decided_by = ${userId}, decided_at = ${AT}`],
      [
        writeOff,
        sql`status = 'REJECTED', decided_by = ${userId}, decided_at = ${AT}, decision_reason = ''`,
      ],
      [transfer, sql`status = 'CANCELLED', decided_by = ${userId}, decided_at = ${AT}`],
      [posted, sql`decision_reason = 'Sabab bor'`],
    ] as const) {
      expect(await refusalOf(update(id, set))).toMatchObject({
        code: CHECK,
        constraint: "stock_documents_decision_reason_check",
      });
    }
    await update(
      writeOff,
      sql`status = 'REJECTED', decided_by = ${userId}, decided_at = ${AT}, decision_reason = 'Sabab bor'`,
    );
    await update(
      transfer,
      sql`status = 'CANCELLED', decided_by = ${userId}, decided_at = ${AT}, decision_reason = 'Sabab bor'`,
    );
  });
});

describe("stock_document_lines (14 stock_document_lines; plan of 5.1, decided items 6 and 11)", () => {
  it("keeps every quantity and the cost at 0 or more", async () => {
    const id = await insertDocument(document("COUNT", { status: "PENDING_APPROVAL" }));
    expect(
      await insertLine(id, await variant(), { qty: "0", counted: "0", received: "0", cost: "0" }),
    ).toBeTruthy();
    const refused: Array<[Parameters<typeof insertLine>[2], string]> = [
      [{ qty: "-1" }, "stock_document_lines_qty_check"],
      [{ counted: "-0.001" }, "stock_document_lines_counted_qty_check"],
      [{ received: "-1" }, "stock_document_lines_received_qty_check"],
      [{ cost: "-1" }, "stock_document_lines_unit_cost_check"],
    ];
    for (const [values, constraint] of refused) {
      expect(await refusalOf(insertLine(id, await variant(), values))).toMatchObject({
        code: CHECK,
        constraint,
      });
    }
  });

  it("holds one line per subtype in a document", async () => {
    const id = await insertDocument(document("ISSUE"));
    const v = await variant();
    await insertLine(id, v);
    expect(await refusalOf(insertLine(id, v))).toMatchObject({
      code: UNIQUE,
      constraint: "stock_document_lines_document_id_variant_id_key",
    });
    expect(await insertLine(await insertDocument(document("ISSUE")), v)).toBeTruthy();
  });
});

describe("stock_movements: the key to a line and one reversal (decided items 4 and 5)", () => {
  async function insertMovement(values: {
    variantId: string;
    type?: string;
    qtyDelta?: string;
    lineId?: string | null;
    reverses?: string | null;
  }) {
    const inserted = await db.execute<{ id: string }>(sql`
      insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost, balance_after,
        document_line_id, reverses_movement_id, created_by, created_at)
      values (${branchId}, ${values.variantId}, ${values.type ?? "DIRECT_ENTRY"},
        ${values.qtyDelta ?? "1"}, 100, 1, ${values.lineId ?? null}, ${values.reverses ?? null},
        ${userId}, ${AT})
      returning id`);
    return inserted.rows[0]!.id;
  }

  it("moves only the subtype of its line, and refuses a line that does not exist", async () => {
    const v = await variant();
    const lineId = await insertLine(await insertDocument(document("DIRECT_ENTRY")), v);
    expect(await insertMovement({ variantId: v, lineId })).toBeTruthy();
    expect(await refusalOf(insertMovement({ variantId: await variant(), lineId }))).toMatchObject({
      code: FOREIGN,
      constraint: "stock_movements_document_line_fk",
    });
    expect(await refusalOf(insertMovement({ variantId: v, lineId: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint: "stock_movements_document_line_fk",
    });
  });

  it("reverses a movement at most once", async () => {
    const v = await variant();
    const first = await insertMovement({ variantId: v });
    await insertMovement({ variantId: v, type: "REVERSAL", qtyDelta: "-1", reverses: first });
    expect(
      await refusalOf(
        insertMovement({ variantId: v, type: "REVERSAL", qtyDelta: "-1", reverses: first }),
      ),
    ).toMatchObject({ code: UNIQUE, constraint: "stock_movements_reverses_movement_id_key" });
  });
});

// The foreign key of migration 0046_stock_count (plan of 7.3, Database changes; decided item 2,
// Look first): a count line's `start_seq` is the `seq` of a real movement, on insert and on update.
describe("stock_document_lines.start_seq (plan of 7.3, decided item 2)", () => {
  const CONSTRAINT = "stock_document_lines_start_seq_stock_movements_seq_fk";

  async function realSeq(variantId: string): Promise<string> {
    const moved = await db.execute<{ seq: string }>(sql`
      insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
        balance_after, created_by, created_at)
      values (${branchId}, ${variantId}, 'RECEIPT', 3, 1000, 3, ${userId}, ${AT})
      returning seq::text as seq`);
    return moved.rows[0]!.seq;
  }

  async function unknownSeq(): Promise<string> {
    const found = await db.execute<{ seq: string }>(
      sql`select (coalesce(max(seq), 0) + 1000000)::text as seq from stock_movements`,
    );
    return found.rows[0]!.seq;
  }

  function insertCountLine(documentId: string, variantId: string, startSeq: string) {
    return db.execute(sql`
      insert into stock_document_lines (document_id, variant_id, qty, start_seq, created_at)
      values (${documentId}, ${variantId}, 3, ${startSeq}::bigint, ${AT})`);
  }

  it("takes the seq of a real movement and refuses one no movement has, on insert", async () => {
    const id = await insertDocument(document("COUNT", { status: "PENDING_APPROVAL" }));
    const kept = await variant();
    await insertCountLine(id, kept, await realSeq(kept));
    const found = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stock_document_lines
      where document_id = ${id} and start_seq is not null`);
    expect(found.rows[0]!.n).toBe(1);

    expect(await refusalOf(insertCountLine(id, await variant(), await unknownSeq()))).toMatchObject(
      { code: FOREIGN, constraint: CONSTRAINT },
    );
  });

  it("refuses an update to a seq no movement has", async () => {
    const id = await insertDocument(document("COUNT", { status: "PENDING_APPROVAL" }));
    const v = await variant();
    await insertCountLine(id, v, await realSeq(v));
    const bogus = await unknownSeq();
    expect(
      await refusalOf(
        db.execute(sql`
          update stock_document_lines set start_seq = ${bogus}::bigint
          where document_id = ${id}`),
      ),
    ).toMatchObject({ code: FOREIGN, constraint: CONSTRAINT });
  });
});
