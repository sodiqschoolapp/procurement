import { eq, sql } from "drizzle-orm";
import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { AuditAction } from "@/domain/audit";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

import { insertBranch } from "../../tests/helpers/branches";
import { refusalOf } from "../../tests/helpers/database-error";
import { setClock } from "../../tests/helpers/clock";
import { type InsertedUser, insertUser } from "../../tests/helpers/users";
import { defineAction, runAction } from "./action";
import type { ActionResult } from "./action-result";
import { audit } from "./audit";

// build-plan 0.9, Done when: "a change and its audit row commit together and roll back together;
// before and after hold the old and the new values". developer-rules.md rule 3 (one transaction
// per action) and rule 13 (changes go to an audit log). The sample table lives in this file's
// own test database only; it is never a migration (as in src/server/action.db.test.ts).

const sampleAccounts = pgTable("sample_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
  limitAmount: bigint("limit_amount", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

beforeAll(async () => {
  await db.execute(sql`
    create table sample_accounts (
      id uuid primary key default gen_random_uuid(),
      branch_id uuid not null references branches (id),
      name text not null,
      limit_amount bigint not null,
      created_at timestamptz not null
    )`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The sample's own action names; the real list is AUDIT_ACTIONS of src/domain/audit.ts.
const RENAME = "sample.rename" as AuditAction;

type Hooks = {
  /** Replaces the wrapper's user given to audit(): one that does not exist reaches the foreign key. */
  actorId?: string;
  /** Extra fields of `after`: a secret field is refused by audit(). */
  extraAfter?: Record<string, unknown>;
  notify?: () => Promise<void>;
};

const renameInput = z.object({ id: z.uuid(), name: z.string().min(1), limitAmount: z.bigint() });

/** Renames a sample account and writes its audit row from the `history` step. */
function renameSample(hooks: Hooks = {}) {
  return defineAction({
    name: "renameSample",
    permission: "catalog.manage",
    input: renameInput,
    async target({ tx, input }) {
      const [row] = await tx
        .select({ branchId: sampleAccounts.branchId })
        .from(sampleAccounts)
        .where(eq(sampleAccounts.id, input.id));
      return row ?? null;
    },
    async lock({ tx, input }) {
      const [row] = await tx
        .select()
        .from(sampleAccounts)
        .where(eq(sampleAccounts.id, input.id))
        .for("update");
      return row ? { target: { branchId: row.branchId }, rows: row } : null;
    },
    async write({ tx, input }) {
      await tx
        .update(sampleAccounts)
        .set({ name: input.name, limitAmount: input.limitAmount })
        .where(eq(sampleAccounts.id, input.id));
      return { id: input.id };
    },
    async history({ tx, input, userId, locked }) {
      const old = locked!.rows;
      await audit(
        { tx, userId: hooks.actorId ?? userId },
        {
          action: RENAME,
          entity: "sample_accounts",
          entityId: input.id,
          before: { name: old.name, limitAmount: old.limitAmount },
          after: { name: input.name, limitAmount: input.limitAmount, ...hooks.extraAfter },
          at: now(),
        },
      );
    },
    async notify() {
      await hooks.notify?.();
    },
  });
}

async function sampleAccount(name = "Invented Account", limitAmount = 1_250_000n) {
  const branch = await insertBranch();
  const [row] = await db
    .insert(sampleAccounts)
    .values({ branchId: branch.id, name, limitAmount, createdAt: now() })
    .returning();
  return row!;
}

async function auditRowsOf(entityId: string) {
  return db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
}

async function accountOf(id: string) {
  const [row] = await db.select().from(sampleAccounts).where(eq(sampleAccounts.id, id));
  return row!;
}

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

let head: InsertedUser;
beforeAll(async () => {
  head = await insertUser("HEAD");
});

describe("audit(): the change and its row in one transaction (build-plan 0.9; rule 3)", () => {
  it("commits the change together with its audit row", async () => {
    const account = await sampleAccount();

    expectOk(
      await runAction(renameSample(), head.id, {
        id: account.id,
        name: "Renamed Account",
        limitAmount: 2_500_000n,
      }),
    );

    expect((await accountOf(account.id)).name).toBe("Renamed Account");
    expect(await auditRowsOf(account.id)).toHaveLength(1);
  });

  it("rolls both back when a later step throws: neither the change nor the row is left", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const account = await sampleAccount();
    const failing = renameSample({
      notify: () => Promise.reject(new Error("invented notification failure")),
    });

    const result = await runAction(failing, head.id, {
      id: account.id,
      name: "Renamed Account",
      limitAmount: 2_500_000n,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect((await accountOf(account.id)).name).toBe("Invented Account");
    expect(await auditRowsOf(account.id)).toEqual([]);
  });

  // Review of the plan of 0.9, must fix 1: a failing audit() takes the change with it.
  it.each<[string, Hooks, string]>([
    [
      "a secret field refused by audit()",
      { extraAfter: { passwordHash: "invented" } },
      'secret field "passwordHash"',
    ],
    [
      "an actor the foreign key refuses",
      { actorId: "00000000-0000-4000-8000-00000000abcd" },
      "PostgreSQL 23503 constraint audit_log_actor_id_users_id_fk",
    ],
  ])("rolls the change back when audit() fails: %s", async (_name, hooks, cause) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const account = await sampleAccount();

    const result = await runAction(renameSample(hooks), head.id, {
      id: account.id,
      name: "Renamed Account",
      limitAmount: 2_500_000n,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(cause));
    expect((await accountOf(account.id)).name).toBe("Invented Account");
    expect(await auditRowsOf(account.id)).toEqual([]);
  });
});

describe("audit(): what the row holds (build-plan 0.9; developer-rules.md rules 6 and 10)", () => {
  it("holds the actor, the action, the entity, the old and the new values, at the clock's moment", async () => {
    const moment = setClock("2031-03-10T09:15:00+05:00");
    const account = await sampleAccount();

    expectOk(
      await runAction(renameSample(), head.id, {
        id: account.id,
        name: "Renamed Account",
        limitAmount: 9_007_199_254_740_993n,
      }),
    );

    expect(await auditRowsOf(account.id)).toEqual([
      {
        id: expect.any(String),
        actorId: head.id,
        action: "sample.rename",
        entity: "sample_accounts",
        entityId: account.id,
        before: { name: "Invented Account", limitAmount: "1250000" },
        // Beyond the safe range of a JavaScript number, and still exact.
        after: { name: "Renamed Account", limitAmount: "9007199254740993" },
        createdAt: moment,
      },
    ]);
  });

  it("writes a create with before null, and refuses a row without either", async () => {
    const at = setClock("2031-03-10T04:00:00Z");
    const account = await sampleAccount();

    await db.transaction((tx) =>
      audit(
        { tx, userId: head.id },
        {
          action: "user.create",
          entity: "sample_accounts",
          entityId: account.id,
          before: null,
          after: { name: account.name },
          at,
        },
      ),
    );
    const write = db.transaction((tx) =>
      audit(
        { tx, userId: head.id },
        {
          action: "user.create",
          entity: "sample_accounts",
          entityId: account.id,
          before: null,
          after: null,
          at,
        },
      ),
    );

    expect(await refusalOf(write)).toMatchObject({
      code: "23514",
      constraint: "audit_log_before_or_after_check",
    });
    expect(await auditRowsOf(account.id)).toMatchObject([
      { before: null, after: { name: "Invented Account" }, createdAt: at },
    ]);
  });
});
