import { describe, expect, it } from "vitest";

import { audit } from "@/server/audit";
import { db } from "@/server/db/client";

import { setClock, advanceClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { listChangeHistory } from "./change-history";

// 04-catalogs.md rule 9 ("who changed what and when"); build-plan 0.9. developer-rules.md rule
// 4 (authorize() in every query) and rule 12 (server paging); plan of 0.9, decision 3 (Look
// first): Head only.

const ENTITY_ID = "00000000-0000-4000-8000-0000000000e1";

async function write(actor: InsertedUser, entity: string, entityId: string, name: string) {
  await audit(db, {
    actorId: actor.id,
    action: "user.create",
    entity,
    entityId,
    before: null,
    after: { name },
    at: advanceClock({ minutes: 1 }),
  });
}

describe("listChangeHistory (04-catalogs.md rule 9)", () => {
  it("returns the rows of one record only, newest first, with who made each", async () => {
    setClock("2031-03-10T04:00:00Z");
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    await write(head, "users", ENTITY_ID, "first");
    // Beside the asked record, each kept out by one of the two filters (D40).
    await write(head, "users", "00000000-0000-4000-8000-0000000000e2", "another user");
    await write(head, "settings", ENTITY_ID, "same id, another table");
    await write(other, "users", ENTITY_ID, "second");

    const found = await listChangeHistory(head.id, { entity: "users", entityId: ENTITY_ID });

    expect(found).toEqual({
      page: 1,
      hasMore: false,
      rows: [
        {
          id: expect.any(String),
          action: "user.create",
          actorName: other.fullName,
          before: null,
          after: { name: "second" },
          createdAt: new Date("2031-03-10T04:04:00Z"),
        },
        {
          id: expect.any(String),
          action: "user.create",
          actorName: head.fullName,
          before: null,
          after: { name: "first" },
          createdAt: new Date("2031-03-10T04:01:00Z"),
        },
      ],
    });
  });

  // developer-rules.md rule 12: lists page on the server.
  it("pages by 50 in a stable order, also among rows of the same moment", async () => {
    setClock("2031-04-01T04:00:00Z");
    const head = await insertUser("HEAD");
    const entityId = "settings_key_paged";
    for (let index = 0; index < 53; index += 1) {
      await audit(db, {
        actorId: head.id,
        action: "user.create",
        entity: "settings",
        entityId,
        before: null,
        after: { index },
        // Ten rows share each moment, so the order also rests on the id.
        at: new Date(Date.UTC(2031, 3, 1, 4, Math.floor(index / 10))),
      });
    }

    const first = await listChangeHistory(head.id, { entity: "settings", entityId });
    const second = await listChangeHistory(head.id, { entity: "settings", entityId, page: 2 });
    const again = await listChangeHistory(head.id, { entity: "settings", entityId });

    expect(first.rows).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.rows).toHaveLength(3);
    expect(second.hasMore).toBe(false);
    expect(again.rows.map((row) => row.id)).toEqual(first.rows.map((row) => row.id));
    const all = [...first.rows, ...second.rows];
    expect(new Set(all.map((row) => row.id)).size).toBe(53);
    const moments = all.map((row) => row.createdAt.getTime());
    expect(moments).toEqual([...moments].sort((a, b) => b - a));
    // The three oldest rows (indexes 0, 1 and 2 are among the ten of the first minute) are last.
    expect(second.rows.every((row) => (row.after as { index: number }).index < 10)).toBe(true);
  });

  it("refuses an input that is not a table name and record id", async () => {
    const head = await insertUser("HEAD");

    await expect(
      listChangeHistory(head.id, { entity: "users; drop table users", entityId: ENTITY_ID }),
    ).rejects.toThrow();
    await expect(listChangeHistory(head.id, { entity: "users", entityId: " " })).rejects.toThrow();
    await expect(
      listChangeHistory(head.id, { entity: "users", entityId: ENTITY_ID, page: 0 }),
    ).rejects.toThrow();
  });
});

describePermissionMatrix("listChangeHistory", {
  permission: "catalog.manage",
  run: ({ user }) => listChangeHistory(user.id, { entity: "users", entityId: user.id }),
});
