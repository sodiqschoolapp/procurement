import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { FILE_MIMES } from "@/domain/files";
import { db } from "@/server/db/client";
import { files } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The guards of `files` (14-data-model.md, files; build plan 0.12), each reached by a direct
// write with nothing in front of it (developer-rules.md rules 5 and 11; D39). Plan of 0.12:
// "Database changes", decisions 9 (client_key) and 11 (10 MB).

const CREATED = new Date("2026-10-14T09:00:00Z");

async function values(overrides: Partial<typeof files.$inferInsert> = {}) {
  const uploader = overrides.uploadedBy ?? (await insertUser("MANAGER")).id;
  return {
    storageKey: randomUUID(),
    originalName: "chek.jpg",
    mime: "image/jpeg" as const,
    sizeBytes: 1000,
    uploadedBy: uploader,
    clientKey: randomUUID(),
    createdAt: CREATED,
    ...overrides,
  };
}

async function insertOne(overrides: Partial<typeof files.$inferInsert> = {}) {
  const [row] = await db
    .insert(files)
    .values(await values(overrides))
    .returning();
  return row!;
}

describe("files table (14-data-model.md: storage_key, original_name, mime, size_bytes, uploaded_by)", () => {
  it("writes a row of each allowed type and reads it back", async () => {
    for (const mime of FILE_MIMES) {
      const row = await insertOne({ mime, sizeBytes: 10_485_760, originalName: "a".repeat(255) });
      const [read] = await db.select().from(files).where(eq(files.id, row.id));
      expect(read).toMatchObject({ mime, sizeBytes: 10_485_760, createdAt: CREATED });
    }
  });

  it.each([0, -1, 10_485_761])(
    "refuses size_bytes %d (04-catalogs.md rule 6: up to 10 MB)",
    async (sizeBytes) => {
      expect(await refusalOf(db.insert(files).values(await values({ sizeBytes })))).toMatchObject({
        code: "23514",
        constraint: "files_size_bytes_check",
      });
    },
  );

  it.each(["", "a".repeat(256)])(
    "refuses an original_name of %#: empty or over 255 characters",
    async (originalName) => {
      expect(
        await refusalOf(db.insert(files).values(await values({ originalName }))),
      ).toMatchObject({ code: "23514", constraint: "files_original_name_check" });
    },
  );

  it("refuses a mime outside the enum", async () => {
    const row = await values();
    const refusal = await refusalOf(
      db.execute(sql`
        insert into files (storage_key, original_name, mime, size_bytes, uploaded_by, client_key, created_at)
        values (${row.storageKey}, 'a.gif', 'image/gif', 10, ${row.uploadedBy}, ${row.clientKey}, ${CREATED})`),
    );
    expect(refusal).toMatchObject({ code: "22P02" });
  });

  it("refuses a second row with the same client_key (developer-rules.md rule 8)", async () => {
    const first = await insertOne();
    expect(
      await refusalOf(db.insert(files).values(await values({ clientKey: first.clientKey }))),
    ).toMatchObject({ code: "23505", constraint: "files_client_key_key" });
  });

  it("refuses a second row with the same storage_key", async () => {
    const first = await insertOne();
    expect(
      await refusalOf(db.insert(files).values(await values({ storageKey: first.storageKey }))),
    ).toMatchObject({ code: "23505", constraint: "files_storage_key_key" });
  });

  it("refuses an uploaded_by that is no user (developer-rules.md rule 5)", async () => {
    expect(
      await refusalOf(db.insert(files).values(await values({ uploadedBy: randomUUID() }))),
    ).toMatchObject({ code: "23503", constraint: "files_uploaded_by_users_id_fk" });
  });

  it("refuses created_at left out: it comes from the clock, never a database default", async () => {
    const row = await values();
    const refusal = await refusalOf(
      db.execute(sql`
        insert into files (storage_key, original_name, mime, size_bytes, uploaded_by, client_key)
        values (${row.storageKey}, 'a.jpg', 'image/jpeg', 10, ${row.uploadedBy}, ${row.clientKey})`),
    );
    expect(refusal).toMatchObject({ code: "23502", column: "created_at" });
  });

  it("refuses an UPDATE, a DELETE and a TRUNCATE (CLAUDE.md rule 11)", async () => {
    const row = await insertOne();
    const guard = { code: "23514", constraint: "files_guard" };
    expect(
      await refusalOf(
        db.update(files).set({ originalName: "boshqa.jpg" }).where(eq(files.id, row.id)),
      ),
    ).toMatchObject(guard);
    expect(await refusalOf(db.delete(files).where(eq(files.id, row.id)))).toMatchObject(guard);
    expect(await refusalOf(db.execute(sql`truncate files`))).toMatchObject(guard);
    const [still] = await db.select().from(files).where(eq(files.id, row.id));
    expect(still).toMatchObject({ originalName: "chek.jpg" });
  });
});
