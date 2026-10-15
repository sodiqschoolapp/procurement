import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow, insertProduct } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0017_catalog_suggestions (developer-rules.md rule 5; D39: every
// guard reached by plain SQL with nothing in front; D40: each refused write beside an accepted
// one). 14-data-model.md: catalog_suggestions; 04-catalogs.md rule 8; CLAUDE.md rule 11 (nothing
// with data is deleted); plan of 1.12, "Database changes" and decision 9, and its review (Should
// fix 5): every CHECK branch on insert; on update the guard trigger refuses first unless the row
// moves from PENDING, so the update tests reach the CHECK through the two allowed moves only.

const AT = "2031-05-12T06:00:00Z";

type Row = {
  branchId: string;
  suggestedBy: string;
  name?: string;
  unitText?: string;
  photoFileId?: string | null;
  note?: string | null;
  status?: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  productId?: string | null;
  clientKey?: string | null;
};

function insertSuggestion(row: Row) {
  return db.execute<{ id: string }>(sql`insert into catalog_suggestions
      (branch_id, suggested_by, name, unit_text, photo_file_id, note, status, decided_by,
       decided_at, decision_note, product_id, client_key, created_at)
    values (${row.branchId}, ${row.suggestedBy}, ${row.name ?? `Taklif ${randomUUID()}`},
      ${row.unitText ?? "dona"}, ${row.photoFileId ?? null}, ${row.note ?? null},
      ${row.status ?? "PENDING"}, ${row.decidedBy ?? null}, ${row.decidedAt ?? null},
      ${row.decisionNote ?? null}, ${row.productId ?? null}, ${row.clientKey ?? null}, ${AT})
    returning id`);
}

async function people() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branchId: branch.id, suggestedBy: manager.id, headId: head.id };
}

async function pending() {
  const who = await people();
  const result = await insertSuggestion(who);
  return { ...who, id: result.rows[0]!.id };
}

const check = (constraint: string) => ({ code: "23514", constraint });
const DECISION = check("catalog_suggestions_decision_check");

describe("catalog_suggestions: the fields (14-data-model.md; 04 rule 8)", () => {
  it("refuses a blank name, measure text, note or decision note; filled ones pass", async () => {
    const who = await people();
    expect(await refusalOf(insertSuggestion({ ...who, name: "  " }))).toMatchObject(
      check("catalog_suggestions_name_check"),
    );
    expect(await refusalOf(insertSuggestion({ ...who, unitText: "" }))).toMatchObject(
      check("catalog_suggestions_unit_text_check"),
    );
    expect(await refusalOf(insertSuggestion({ ...who, note: " " }))).toMatchObject(
      check("catalog_suggestions_note_check"),
    );
    expect(
      await refusalOf(
        insertSuggestion({
          ...who,
          status: "DECLINED",
          decidedBy: who.headId,
          decidedAt: AT,
          decisionNote: "  ",
        }),
      ),
    ).toMatchObject(check("catalog_suggestions_decision_note_check"));
    await insertSuggestion({ ...who, note: "Laboratoriya uchun" });
  });

  it("refuses a status outside the enum", async () => {
    const who = await people();
    expect(await refusalOf(insertSuggestion({ ...who, status: "OPEN" }))).toMatchObject({
      code: "22P02",
    });
  });

  it("has a foreign key on the branch, both users, the photo and the product", async () => {
    const who = await people();
    const missing = randomUUID();
    const fk = (constraint: string) => ({ code: "23503", constraint });
    expect(await refusalOf(insertSuggestion({ ...who, branchId: missing }))).toMatchObject(
      fk("catalog_suggestions_branch_id_branches_id_fk"),
    );
    expect(await refusalOf(insertSuggestion({ ...who, suggestedBy: missing }))).toMatchObject(
      fk("catalog_suggestions_suggested_by_users_id_fk"),
    );
    expect(await refusalOf(insertSuggestion({ ...who, photoFileId: missing }))).toMatchObject(
      fk("catalog_suggestions_photo_file_id_files_id_fk"),
    );
    const decided = { ...who, status: "ADDED", decidedAt: AT };
    const product = await insertProduct();
    expect(
      await refusalOf(insertSuggestion({ ...decided, decidedBy: missing, productId: product.id })),
    ).toMatchObject(fk("catalog_suggestions_decided_by_users_id_fk"));
    expect(
      await refusalOf(insertSuggestion({ ...decided, decidedBy: who.headId, productId: missing })),
    ).toMatchObject(fk("catalog_suggestions_product_id_products_id_fk"));
  });

  it("holds a photo, a product and a client key once", async () => {
    const who = await people();
    const photo = await insertFileRow(who.suggestedBy);
    const product = await insertProduct();
    const clientKey = randomUUID();
    await insertSuggestion({ ...who, photoFileId: photo.id, clientKey });
    const unique = (constraint: string) => ({ code: "23505", constraint });
    expect(await refusalOf(insertSuggestion({ ...who, photoFileId: photo.id }))).toMatchObject(
      unique("catalog_suggestions_photo_file_id_key"),
    );
    expect(await refusalOf(insertSuggestion({ ...who, clientKey }))).toMatchObject(
      unique("catalog_suggestions_client_key_key"),
    );
    const added = {
      ...who,
      status: "ADDED",
      decidedBy: who.headId,
      decidedAt: AT,
      productId: product.id,
    };
    await insertSuggestion(added);
    expect(await refusalOf(insertSuggestion(added))).toMatchObject(
      unique("catalog_suggestions_product_id_key"),
    );
  });
});

describe("catalog_suggestions: the decision columns follow the status (plan of 1.12, Database changes)", () => {
  it("on insert: PENDING carries no decision", async () => {
    const who = await people();
    const product = await insertProduct();
    for (const extra of [
      { decidedBy: who.headId },
      { decidedAt: AT },
      { decisionNote: "Erta" },
      { productId: product.id },
    ]) {
      expect(await refusalOf(insertSuggestion({ ...who, ...extra }))).toMatchObject(DECISION);
    }
    await insertSuggestion(who);
  });

  it("on insert: ADDED needs who, when and the product", async () => {
    const who = await people();
    const product = await insertProduct();
    const added = {
      ...who,
      status: "ADDED",
      decidedBy: who.headId,
      decidedAt: AT,
      productId: product.id,
    };
    for (const missing of [{ decidedBy: null }, { decidedAt: null }, { productId: null }]) {
      expect(await refusalOf(insertSuggestion({ ...added, ...missing }))).toMatchObject(DECISION);
    }
    await insertSuggestion(added);
  });

  it("on insert: DECLINED needs who, when and the reason, and no product", async () => {
    const who = await people();
    const product = await insertProduct();
    const declined = {
      ...who,
      status: "DECLINED",
      decidedBy: who.headId,
      decidedAt: AT,
      decisionNote: "Omborda bor",
    };
    for (const wrong of [
      { decidedBy: null },
      { decidedAt: null },
      { decisionNote: null },
      { productId: product.id },
    ]) {
      expect(await refusalOf(insertSuggestion({ ...declined, ...wrong }))).toMatchObject(DECISION);
    }
    await insertSuggestion(declined);
  });

  it("on update: PENDING → ADDED without a product and PENDING → DECLINED without a reason are refused by the CHECK", async () => {
    const one = await pending();
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'ADDED', decided_by = ${one.headId}, decided_at = ${AT}
          where id = ${one.id}`),
      ),
    ).toMatchObject(DECISION);
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'DECLINED', decided_by = ${one.headId}, decided_at = ${AT}
          where id = ${one.id}`),
      ),
    ).toMatchObject(DECISION);
    // The full decision passes beside them (D40).
    await db.execute(sql`update catalog_suggestions
      set status = 'DECLINED', decided_by = ${one.headId}, decided_at = ${AT},
        decision_note = 'Omborda bor'
      where id = ${one.id}`);
  });
});

describe("catalog_suggestions: decided once, never deleted (plan of 1.12, decision 9; CLAUDE.md rule 11)", () => {
  it("refuses a delete of a pending and of a decided suggestion", async () => {
    const one = await pending();
    const noDelete = check("catalog_suggestions_no_delete");
    expect(
      await refusalOf(db.execute(sql`delete from catalog_suggestions where id = ${one.id}`)),
    ).toMatchObject(noDelete);
    await db.execute(sql`update catalog_suggestions
      set status = 'DECLINED', decided_by = ${one.headId}, decided_at = ${AT}, decision_note = 'Yo''q'
      where id = ${one.id}`);
    expect(
      await refusalOf(db.execute(sql`delete from catalog_suggestions where id = ${one.id}`)),
    ).toMatchObject(noDelete);
  });

  it("refuses an update that stays PENDING, a decided row changed, and a decided row back to PENDING", async () => {
    const once = check("catalog_suggestions_decided_once");
    const one = await pending();
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions set name = 'Boshqa' where id = ${one.id}`),
      ),
    ).toMatchObject(once);
    await db.execute(sql`update catalog_suggestions
      set status = 'DECLINED', decided_by = ${one.headId}, decided_at = ${AT}, decision_note = 'Yo''q'
      where id = ${one.id}`);
    expect(
      await refusalOf(
        db.execute(
          sql`update catalog_suggestions set decision_note = 'Boshqa sabab' where id = ${one.id}`,
        ),
      ),
    ).toMatchObject(once);
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'PENDING', decided_by = null, decided_at = null, decision_note = null
          where id = ${one.id}`),
      ),
    ).toMatchObject(once);
  });

  it("refuses a decision that also changes what was sent", async () => {
    const sentFixed = check("catalog_suggestions_sent_fixed");
    for (const change of [
      sql`name = 'Boshqa nom'`,
      sql`unit_text = 'quti'`,
      sql`note = 'Yangi izoh'`,
      sql`client_key = ${randomUUID()}`,
      sql`created_at = ${"2031-05-13T06:00:00Z"}`,
    ]) {
      const one = await pending();
      expect(
        await refusalOf(
          db.execute(sql`update catalog_suggestions
            set status = 'DECLINED', decided_by = ${one.headId}, decided_at = ${AT},
              decision_note = 'Yo''q', ${change}
            where id = ${one.id}`),
        ),
      ).toMatchObject(sentFixed);
    }
    const photo = await pending();
    const file = await insertFileRow(photo.suggestedBy);
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'DECLINED', decided_by = ${photo.headId}, decided_at = ${AT},
            decision_note = 'Yo''q', photo_file_id = ${file.id}
          where id = ${photo.id}`),
      ),
    ).toMatchObject(sentFixed);
    const moved = await pending();
    const other = await insertBranch();
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'DECLINED', decided_by = ${moved.headId}, decided_at = ${AT},
            decision_note = 'Yo''q', branch_id = ${other.id}
          where id = ${moved.id}`),
      ),
    ).toMatchObject(sentFixed);
    const by = await pending();
    expect(
      await refusalOf(
        db.execute(sql`update catalog_suggestions
          set status = 'DECLINED', decided_by = ${by.headId}, decided_at = ${AT},
            decision_note = 'Yo''q', suggested_by = ${by.headId}
          where id = ${by.id}`),
      ),
    ).toMatchObject(sentFixed);
  });

  it("lets PENDING move once to ADDED with its product (the accepted move beside the refusals, D40)", async () => {
    const one = await pending();
    const product = await insertProduct();
    await db.execute(sql`update catalog_suggestions
      set status = 'ADDED', decided_by = ${one.headId}, decided_at = ${AT}, product_id = ${product.id}
      where id = ${one.id}`);
    const rows = await db.execute<{ status: string }>(
      sql`select status from catalog_suggestions where id = ${one.id}`,
    );
    expect(rows.rows[0]!.status).toBe("ADDED");
  });
});
