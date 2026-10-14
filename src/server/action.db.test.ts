import { eq, sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { isClientKey, newClientKey } from "@/components/client-key";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../tests/helpers/branches";
import { setClock } from "../../tests/helpers/clock";
import { runTogether, type Meet } from "../../tests/helpers/together";
import { type InsertedUser, insertUser } from "../../tests/helpers/users";
import {
  type ActionDefinition,
  ActionError,
  GLOBAL_TARGET,
  defineAction,
  runAction,
  serverAction,
} from "./action";
import type { ActionResult } from "./action-result";

// The action wrapper with a sample action (build plan 0.8, Done when; plan of 0.8, Tests). The
// sample table lives in this file's own test database only; it is never a migration (plan,
// decision 10). Every fixture is asserted, never made under `if (result.ok)` (D38).

const sampleRecords = pgTable("sample_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  clientKey: uuid("client_key").notNull().unique(),
  status: text("status").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

beforeAll(async () => {
  await db.execute(sql`
    create table sample_records (
      id uuid primary key default gen_random_uuid(),
      branch_id uuid not null references branches (id),
      owner_id uuid not null references users (id),
      client_key uuid not null unique,
      status text not null,
      version integer not null,
      title text not null,
      created_at timestamptz not null
    )`);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(sampleRecords);
});

type Hooks = {
  order?: string[];
  /** Runs inside the step `target`, after its read: a test moves the row or meets here. */
  afterTarget?: () => Promise<void>;
  history?: () => Promise<void>;
  notify?: () => Promise<void>;
  write?: () => Promise<void>;
};

const createInput = z.object({
  clientKey: z.string().refine(isClientKey),
  branchId: z.uuid(),
  title: z.string().min(1).max(50),
});

type Created = { id: string; title: string };

/** Creates a sample record: request.create, own branch, a client key. */
function createSample(hooks: Hooks = {}) {
  const order = hooks.order ?? [];
  return defineAction({
    name: "createSample",
    permission: "request.create",
    input: createInput,
    async target({ input }) {
      order.push("target");
      await hooks.afterTarget?.();
      return { branchId: input.branchId };
    },
    repeat: {
      clientKey: (input) => input.clientKey,
      async find(tx, clientKey) {
        order.push("repeat");
        const [row] = await tx
          .select()
          .from(sampleRecords)
          .where(eq(sampleRecords.clientKey, clientKey));
        return row
          ? {
              result: { id: row.id, title: row.title },
              userId: row.ownerId,
              branchId: row.branchId,
            }
          : null;
      },
    },
    check() {
      order.push("check");
    },
    async write({ tx, input, userId }): Promise<Created> {
      order.push("write");
      const [row] = await tx
        .insert(sampleRecords)
        .values({
          branchId: input.branchId,
          ownerId: userId,
          clientKey: input.clientKey,
          status: "open",
          version: 1,
          title: input.title,
          createdAt: now(),
        })
        .returning({ id: sampleRecords.id, title: sampleRecords.title });
      await hooks.write?.();
      return row!;
    },
    async history() {
      order.push("history");
      await hooks.history?.();
    },
    async notify() {
      order.push("notify");
      await hooks.notify?.();
    },
  });
}

const editInput = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  title: z.string().min(1).max(50),
});

/** Edits a sample record: request.edit (own requests), with the version. */
function editSample(hooks: Hooks & { withoutVersionOf?: boolean } = {}) {
  const order = hooks.order ?? [];
  const definition: ActionDefinition<typeof editInput, { status: string }, { title: string }> = {
    name: "editSample",
    permission: "request.edit",
    input: editInput,
    async target({ tx, input }) {
      order.push("target");
      const [row] = await tx
        .select({ branchId: sampleRecords.branchId, ownerId: sampleRecords.ownerId })
        .from(sampleRecords)
        .where(eq(sampleRecords.id, input.id));
      await hooks.afterTarget?.();
      return row ?? null;
    },
    async lock({ tx, input }) {
      order.push("lock");
      const [row] = await tx
        .select()
        .from(sampleRecords)
        .where(eq(sampleRecords.id, input.id))
        .for("update");
      if (!row) return null;
      return {
        target: { branchId: row.branchId, ownerId: row.ownerId },
        version: { id: row.id, current: row.version },
        rows: { status: row.status },
      };
    },
    versionOf: hooks.withoutVersionOf
      ? undefined
      : { table: sampleRecords, id: sampleRecords.id, version: sampleRecords.version },
    check({ locked }) {
      order.push("check");
      if (locked?.rows.status !== "open") throw new ActionError("wrong_status");
    },
    async write({ tx, input }) {
      order.push("write");
      await tx
        .update(sampleRecords)
        .set({ title: input.title })
        .where(eq(sampleRecords.id, input.id));
      await hooks.write?.();
      return { title: input.title };
    },
    async history() {
      order.push("history");
      await hooks.history?.();
    },
    async notify() {
      order.push("notify");
      await hooks.notify?.();
    },
  };
  return defineAction(definition);
}

async function rows() {
  return db.select().from(sampleRecords).orderBy(sampleRecords.createdAt);
}

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function managerWithBranch(): Promise<{ manager: InsertedUser; branchId: string }> {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  return { manager, branchId: branch.id };
}

/** A sample record made through the wrapper, asserted (D38). */
async function created(manager: InsertedUser, branchId: string, title = "Sinov") {
  return expectOk(
    await runAction(createSample(), manager.id, { clientKey: newClientKey(), branchId, title }),
  );
}

describe("one transaction per action (developer-rules.md rule 3)", () => {
  it("runs the steps in the fixed order of rule 3", async () => {
    const { manager, branchId } = await managerWithBranch();
    const first = await created(manager, branchId);

    const order: string[] = [];
    expectOk(
      await runAction(editSample({ order }), manager.id, {
        id: first.id,
        version: 1,
        title: "Yangi",
      }),
    );
    expect(order).toEqual(["target", "lock", "check", "write", "history", "notify"]);

    const createOrder: string[] = [];
    await runAction(createSample({ order: createOrder }), manager.id, {
      clientKey: newClientKey(),
      branchId,
      title: "Ikkinchi",
    });
    expect(createOrder).toEqual(["target", "repeat", "check", "write", "history", "notify"]);
  });

  it("checks permission before it locks: a refused user reaches no lock and no write", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const stranger = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });

    const order: string[] = [];
    const result = await runAction(editSample({ order }), stranger.id, {
      id: record.id,
      version: 1,
      title: "Yangi",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", messageKey: "errors.notFound" },
    });
    expect(order).toEqual(["target"]);
  });

  for (const step of ["write", "history", "notify"] as const) {
    it(`a ${step} step that throws leaves nothing saved`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { manager, branchId } = await managerWithBranch();
      const fail = async () => {
        throw new Error(`invented failure in ${step}`);
      };

      const result = await runAction(createSample({ [step]: fail }), manager.id, {
        clientKey: newClientKey(),
        branchId,
        title: "Sinov",
      });
      expect(result).toEqual({
        ok: false,
        error: { code: "unexpected", messageKey: "errors.unexpected" },
      });
      expect(await rows()).toEqual([]);
    });
  }

  it("an edit whose history step throws keeps the old title and the old version", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId, "Eski");

    const result = await runAction(
      editSample({
        history: async () => {
          throw new Error("invented failure");
        },
      }),
      manager.id,
      { id: record.id, version: 1, title: "Yangi" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(await rows()).toMatchObject([{ title: "Eski", version: 1 }]);
  });

  it("an unexpected error is logged by name and message only, never with the input", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { manager, branchId } = await managerWithBranch();

    await runAction(
      createSample({
        write: async () => {
          throw new TypeError("invented failure");
        },
      }),
      manager.id,
      { clientKey: newClientKey(), branchId, title: "Maxfiy nom" },
    );
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([
      "Action createSample failed: TypeError: invented failure",
    ]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Maxfiy nom");
  });

  it("a refused SQL statement is logged without its values (CLAUDE.md conventions; plan, decision 7)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { manager, branchId } = await managerWithBranch();
    const taken = await created(manager, branchId);
    const [row] = await db.select().from(sampleRecords);
    const clientKey = newClientKey();

    const result = await runAction(
      createSample({
        write: async () => {
          // A second row with a taken client_key: the database refuses it, and Drizzle's error
          // message would carry every bound value of the statement.
          await db.insert(sampleRecords).values({ ...row!, id: undefined, title: "Maxfiy nom" });
        },
      }),
      manager.id,
      { clientKey, branchId, title: "Maxfiy nom" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(logged).toHaveBeenCalledTimes(1);
    const text = String(logged.mock.calls[0]);
    expect(text).toContain("23505");
    expect(text).toContain("sample_records_client_key_key");
    for (const value of ["Maxfiy nom", row!.clientKey, clientKey, manager.id, branchId, taken.id]) {
      expect(text).not.toContain(value);
    }
  });

  it("a refusal thrown by a step is returned with its code and rolls back", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    await db.update(sampleRecords).set({ status: "closed" });

    const result = await runAction(editSample(), manager.id, {
      id: record.id,
      version: 1,
      title: "Yangi",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "wrong_status", messageKey: "errors.wrongStatus" },
    });
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });
});

describe("the input check comes first (developer-rules.md rule 13)", () => {
  it("invalid input never reaches a step, and each wrong field has its key", async () => {
    const { manager, branchId } = await managerWithBranch();
    const order: string[] = [];

    const result = await runAction(createSample({ order }), manager.id, {
      clientKey: "not-a-key",
      branchId,
      title: "x".repeat(51),
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { clientKey: "errors.field.wrongFormat", title: "errors.field.tooLong" },
      },
    });
    expect(order).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it("a versioned action without a version, or with a version that is not a whole number, is refused by Zod", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const order: string[] = [];

    for (const version of [undefined, 0, 1.5, "1"]) {
      const result = await runAction(editSample({ order }), manager.id, {
        id: record.id,
        version,
        title: "Yangi",
      });
      expect(result, String(version)).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { version: expect.any(String) } },
      });
    }
    expect(order).toEqual([]);
  });

  it("a locked version with no version in the input is invalid_input, the wrapper's last check", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const loose = defineAction({ ...editSample(), input: editInput.omit({ version: true }) });

    const result = await runAction(loose, manager.id, { id: record.id, title: "Yangi" });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });
});

describe("safe repeats by client_key (developer-rules.md rule 8)", () => {
  it("the same client_key twice writes once and returns the first result; the repeat runs no step after it", async () => {
    const { manager, branchId } = await managerWithBranch();
    const clientKey = newClientKey();
    const first = await runAction(createSample(), manager.id, {
      clientKey,
      branchId,
      title: "Birinchi",
    });

    const order: string[] = [];
    const history = vi.fn(async () => undefined);
    const notify = vi.fn(async () => undefined);
    const second = await runAction(createSample({ order, history, notify }), manager.id, {
      clientKey,
      branchId,
      title: "Ikkinchi",
    });

    expect(second).toEqual(first);
    expect(expectOk(second).title).toBe("Birinchi");
    expect(order).toEqual(["target", "repeat"]);
    expect(history).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(await rows()).toMatchObject([{ title: "Birinchi", version: 1 }]);
  });

  it("the same client_key at the same moment writes once and both get the first result", async () => {
    const { manager, branchId } = await managerWithBranch();
    const clientKey = newClientKey();
    const send = (meet: Meet) =>
      runAction(createSample({ afterTarget: meet }), manager.id, {
        clientKey,
        branchId,
        title: "Bir vaqtda",
      });

    const [a, b] = await runTogether([send, send]);
    expect(a).toMatchObject({ status: "fulfilled", value: { ok: true } });
    expect(b).toMatchObject({ status: "fulfilled", value: { ok: true } });
    const aValue = (a as PromiseFulfilledResult<ActionResult<Created>>).value;
    const bValue = (b as PromiseFulfilledResult<ActionResult<Created>>).value;
    expect(aValue).toEqual(bValue);
    expect(await rows()).toHaveLength(1);
  });

  describe("returns the first result only to who made it, in its branch (progress 0.4, For 0.8)", () => {
    async function firstOfManager() {
      const own = await insertBranch();
      const other = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
      const clientKey = newClientKey();
      const first = expectOk(
        await runAction(createSample(), manager.id, {
          clientKey,
          branchId: own.id,
          title: "Birinchi",
        }),
      );
      return { own, other, manager, clientKey, first };
    }

    it("the same user and branch gets the first result", async () => {
      const { own, manager, clientKey, first } = await firstOfManager();
      const again = await runAction(createSample(), manager.id, {
        clientKey,
        branchId: own.id,
        title: "Boshqa",
      });
      expect(expectOk(again)).toEqual(first);
    });

    const cases: Record<
      string,
      (
        s: Awaited<ReturnType<typeof firstOfManager>>,
      ) => Promise<{ userId: string; branchId: string }>
    > = {
      "the same user in another branch": async ({ other, manager }) => ({
        userId: manager.id,
        branchId: other.id,
      }),
      "a colleague Manager of the same branch": async ({ own }) => ({
        userId: (await insertUser("MANAGER", { branches: [own.id] })).id,
        branchId: own.id,
      }),
      "the Head with a Manager's key": async ({ own }) => ({
        userId: (await insertUser("HEAD")).id,
        branchId: own.id,
      }),
      "a Manager of another branch": async () => {
        const branch = await insertBranch();
        const stranger = await insertUser("MANAGER", { branches: [branch.id] });
        return { userId: stranger.id, branchId: branch.id };
      },
    };

    for (const [name, who] of Object.entries(cases)) {
      it(`${name} gets "Not found" and writes nothing`, async () => {
        const setUp = await firstOfManager();
        const { userId, branchId } = await who(setUp);
        const order: string[] = [];

        const result = await runAction(createSample({ order }), userId, {
          clientKey: setUp.clientKey,
          branchId,
          title: "Boshqa",
        });
        expect(result).toEqual({
          ok: false,
          error: { code: "not_found", messageKey: "errors.notFound" },
        });
        expect(order).toEqual(["target", "repeat"]);
        // The first record stays beside the refusal (D40).
        expect(await rows()).toMatchObject([{ id: setUp.first.id, title: "Birinchi" }]);
      });
    }
  });

  it("a repeat after the right was switched off is refused, not answered (plan, decision 3)", async () => {
    const { manager, branchId } = await managerWithBranch();
    const clientKey = newClientKey();
    expectOk(await runAction(createSample(), manager.id, { clientKey, branchId, title: "Sinov" }));
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);

    const again = await runAction(createSample(), manager.id, {
      clientKey,
      branchId,
      title: "Sinov",
    });
    expect(again).toEqual({
      ok: false,
      error: { code: "forbidden", messageKey: "errors.forbidden" },
    });
    expect(await rows()).toHaveLength(1);
  });
});

describe("the version check (developer-rules.md rule 9)", () => {
  it("the current version passes and the wrapper raises it by 1", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);

    expectOk(await runAction(editSample(), manager.id, { id: record.id, version: 1, title: "B" }));
    expectOk(await runAction(editSample(), manager.id, { id: record.id, version: 2, title: "C" }));
    expect(await rows()).toMatchObject([{ title: "C", version: 3 }]);
  });

  it("an old version is refused with its message and nothing changes", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId, "Eski");
    expectOk(await runAction(editSample(), manager.id, { id: record.id, version: 1, title: "B" }));
    const order: string[] = [];

    const result = await runAction(editSample({ order }), manager.id, {
      id: record.id,
      version: 1,
      title: "Kech qolgan",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "stale_version", messageKey: "errors.staleVersion" },
    });
    expect(order).toEqual(["target", "lock"]);
    expect(await rows()).toMatchObject([{ title: "B", version: 2 }]);
  });

  it("two edits with one version at the same moment: the first wins, the second is stale", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const send = (title: string) => (meet: Meet) =>
      runAction(editSample({ afterTarget: meet }), manager.id, {
        id: record.id,
        version: 1,
        title,
      });

    const outcomes = await runTogether([send("A"), send("B")]);
    const results = outcomes.map(
      (outcome) => (outcome as PromiseFulfilledResult<ActionResult<{ title: string }>>).value,
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: { code: "stale_version", messageKey: "errors.staleVersion" } },
    ]);
    const winner = results.find((result) => result.ok) as { ok: true; data: { title: string } };
    expect(await rows()).toMatchObject([{ title: winner.data.title, version: 2 }]);
  });

  it("a lock that returns a version without versionOf is a mistake: unexpected, nothing written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);

    const result = await runAction(editSample({ withoutVersionOf: true }), manager.id, {
      id: record.id,
      version: 1,
      title: "Yangi",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });
});

describe("the record is read again under the lock (plan, decision 1; 03 rule 1)", () => {
  it("an owner moved between the read and the lock gives conflict and nothing is written", async () => {
    const { manager, branchId } = await managerWithBranch();
    const colleague = await insertUser("MANAGER", { branches: [branchId] });
    const record = await created(manager, branchId);

    const result = await runAction(
      editSample({
        afterTarget: async () => {
          // Another connection moves the request to a colleague and commits.
          await db
            .update(sampleRecords)
            .set({ ownerId: colleague.id })
            .where(eq(sampleRecords.id, record.id));
        },
      }),
      manager.id,
      { id: record.id, version: 1, title: "Yangi" },
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "conflict", messageKey: "errors.conflict" },
    });
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1, ownerId: colleague.id }]);
  });

  it("a branch changed between the read and the lock gives conflict", async () => {
    const head = await insertUser("HEAD");
    const { manager, branchId } = await managerWithBranch();
    const other = await insertBranch();
    const record = await created(manager, branchId);

    const result = await runAction(
      editSample({
        afterTarget: async () => {
          await db
            .update(sampleRecords)
            .set({ branchId: other.id })
            .where(eq(sampleRecords.id, record.id));
        },
      }),
      head.id,
      { id: record.id, version: 1, title: "Yangi" },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });

  it("an unchanged record passes, with another branch's record beside it (D40)", async () => {
    const { manager, branchId } = await managerWithBranch();
    const { manager: stranger, branchId: otherBranchId } = await managerWithBranch();
    const mine = await created(manager, branchId, "Meniki");
    const theirs = await created(stranger, otherBranchId, "Boshqaniki");

    expectOk(
      await runAction(editSample(), manager.id, { id: mine.id, version: 1, title: "Yangi" }),
    );
    const after = await rows();
    expect(after.find((row) => row.id === mine.id)).toMatchObject({ title: "Yangi", version: 2 });
    expect(after.find((row) => row.id === theirs.id)).toMatchObject({
      title: "Boshqaniki",
      version: 1,
    });
  });

  it("a record that does not exist is Not found, before authorize()", async () => {
    const { manager } = await managerWithBranch();
    const order: string[] = [];

    const result = await runAction(editSample({ order }), manager.id, {
      id: "00000000-0000-4000-8000-000000000000",
      version: 1,
      title: "Yangi",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", messageKey: "errors.notFound" },
    });
    expect(order).toEqual(["target"]);
  });

  it("a record gone between the read and the lock is Not found, not conflict", async () => {
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const other = await created(manager, branchId, "Qoladi");
    const order: string[] = [];

    const result = await runAction(
      editSample({
        order,
        afterTarget: async () => {
          // A draft that was never submitted may be deleted (CLAUDE.md rule 11).
          await db.delete(sampleRecords).where(eq(sampleRecords.id, record.id));
        },
      }),
      manager.id,
      { id: record.id, version: 1, title: "Yangi" },
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "not_found", messageKey: "errors.notFound" },
    });
    expect(order).toEqual(["target", "lock"]);
    expect(await rows()).toMatchObject([{ id: other.id, title: "Qoladi", version: 1 }]);
  });
});

describe("the permission layer inside the wrapper (developer-rules.md rule 4)", () => {
  it("another branch is Not found and a switched-off right is forbidden; nothing is written", async () => {
    const { manager, branchId } = await managerWithBranch();
    const other = await insertBranch();

    const elsewhere = await runAction(createSample(), manager.id, {
      clientKey: newClientKey(),
      branchId: other.id,
      title: "Sinov",
    });
    expect(elsewhere).toMatchObject({ ok: false, error: { code: "not_found" } });

    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    const switchedOff = await runAction(createSample(), manager.id, {
      clientKey: newClientKey(),
      branchId,
      title: "Sinov",
    });
    expect(switchedOff).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await rows()).toEqual([]);
  });
});

describe("the definition itself", () => {
  it("an action that is neither a create (repeat) nor locks its rows is a mistake: unexpected, nothing runs past authorize()", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { manager, branchId } = await managerWithBranch();
    const record = await created(manager, branchId);
    const order: string[] = [];
    const unlocked = defineAction({ ...editSample({ order }), lock: undefined });

    const result = await runAction(unlocked, manager.id, {
      id: record.id,
      version: 1,
      title: "Yangi",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(order).toEqual(["target"]);
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });
});

const globalInput = z.object({ branchId: z.uuid(), title: z.string().min(1).max(50) });

/**
 * An action of the global permission profile.edit (plan of 0.10b, decision 4): no branch is
 * checked, the user's own row is the lock. It writes a sample record so a test can see the write.
 */
function globalSample(order: string[] = []) {
  return defineAction({
    name: "globalSample",
    permission: "profile.edit",
    input: globalInput,
    async target() {
      order.push("target");
      return GLOBAL_TARGET;
    },
    async lock({ tx, userId }) {
      order.push("lock");
      const [row] = await tx
        .select({ id: sql<string>`id` })
        .from(sql`users`)
        .where(sql`id = ${userId}`)
        .for("update");
      return row ? { target: GLOBAL_TARGET, rows: row } : null;
    },
    async write({ tx, input, userId }) {
      order.push("write");
      await tx.insert(sampleRecords).values({
        branchId: input.branchId,
        ownerId: userId,
        clientKey: newClientKey(),
        status: "open",
        version: 1,
        title: input.title,
        createdAt: now(),
      });
      return { title: input.title };
    },
  });
}

describe("the global form (plan of 0.10b, decision 4; review of the plan, correction 4)", () => {
  it("an action of a global permission runs without a branch, under the lock of its own row", async () => {
    const branch = await insertBranch();
    const principal = await insertUser("PRINCIPAL");
    const order: string[] = [];

    expectOk(
      await runAction(globalSample(order), principal.id, { branchId: branch.id, title: "Sinov" }),
    );
    expect(order).toEqual(["target", "lock", "write"]);
    expect(await rows()).toMatchObject([{ ownerId: principal.id, title: "Sinov" }]);
  });

  const mistakes = [
    {
      name: "GLOBAL_TARGET with a branch permission",
      action: (order: string[]) =>
        defineAction({ ...globalSample(order), permission: "request.create" }),
    },
    {
      name: "a branch target with a global permission",
      action: (order: string[]) =>
        defineAction({
          ...globalSample(order),
          async target({ input }: { input: z.output<typeof globalInput> }) {
            order.push("target");
            return { branchId: input.branchId };
          },
        }),
    },
    {
      name: "GLOBAL_TARGET with repeat",
      action: (order: string[]) =>
        defineAction({
          ...globalSample(order),
          repeat: { clientKey: () => newClientKey(), find: async () => null },
        }),
    },
  ];

  for (const { name, action } of mistakes) {
    it(`${name} is a definition error: unexpected, nothing runs past target, nothing saved`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const branch = await insertBranch();
      const head = await insertUser("HEAD");
      const order: string[] = [];

      const result = await runAction(action(order), head.id, {
        branchId: branch.id,
        title: "Sinov",
      });
      expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
      expect(order).toEqual(["target"]);
      expect(await rows()).toEqual([]);
    });
  }
});

describe("own requests through the wrapper (03 permission matrix: request.edit, own requests)", () => {
  it("a colleague Manager of the same branch is forbidden, reaches no lock and writes nothing", async () => {
    const { manager, branchId } = await managerWithBranch();
    const colleague = await insertUser("MANAGER", { branches: [branchId] });
    const record = await created(manager, branchId);
    const order: string[] = [];

    const result = await runAction(editSample({ order }), colleague.id, {
      id: record.id,
      version: 1,
      title: "Yangi",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "forbidden", messageKey: "errors.forbidden" },
    });
    expect(order).toEqual(["target"]);
    expect(await rows()).toMatchObject([{ title: "Sinov", version: 1 }]);
  });
});

describe("serverAction()", () => {
  it("with no signed-in user returns signed_out and runs no step", async () => {
    const order: string[] = [];
    const action = serverAction(createSample({ order }), async () => null);

    const result = await action({
      clientKey: newClientKey(),
      branchId: "00000000-0000-4000-8000-000000000000",
      title: "Sinov",
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "signed_out", messageKey: "errors.signedOut" },
    });
    expect(order).toEqual([]);
  });

  it("runs the action for the signed-in user", async () => {
    setClock("2026-10-14T09:00:00Z");
    const { manager, branchId } = await managerWithBranch();
    const action = serverAction(createSample(), async () => ({
      id: manager.id,
      fullName: manager.fullName,
      username: manager.username,
      role: "MANAGER",
      locale: "uz",
      sessionToken: "invented-token",
    }));

    expectOk(await action({ clientKey: newClientKey(), branchId, title: "Sinov" }));
    expect(await rows()).toMatchObject([
      { ownerId: manager.id, createdAt: new Date("2026-10-14T09:00:00Z") },
    ]);
  });
});
