import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { runAction, defineAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, users } from "@/server/db/schema";

import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { chooseOwnLanguage } from "./own-language";

// 02-assumptions.md A2 ("Each user picks one" language); plan of 0.10b, decisions 1, 2 and 4
// (Look first): profile.edit, an audit row in the same transaction (developer-rules.md rule 13),
// the wrapper's global form with the person's own row as the lock (rule 3).

async function localeOf(userId: string) {
  const [row] = await db
    .select({ locale: users.locale, updatedAt: users.updatedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

async function auditRowsOf(userId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityId, userId), eq(auditLog.action, "user.change_language")));
}

describe("chooseOwnLanguage (A2; plan of 0.10b)", () => {
  it("changes only the caller's own locale and writes one audit row with the clock's time (rule 13)", async () => {
    setClock("2026-10-14T09:00:00Z");
    const manager = await insertUser("MANAGER");
    // Another person beside it keeps their language (D40).
    const other = await insertUser("FINANCE");
    setClock("2026-10-14T10:30:00Z");

    const result = await runAction(chooseOwnLanguage, manager.id, { locale: "ru" });

    expect(result).toEqual({ ok: true, data: { locale: "ru" } });
    expect(await localeOf(manager.id)).toEqual({
      locale: "ru",
      updatedAt: new Date("2026-10-14T10:30:00Z"),
    });
    expect((await localeOf(other.id))?.locale).toBe("uz");
    expect(await auditRowsOf(manager.id)).toMatchObject([
      {
        actorId: manager.id,
        entity: "users",
        before: { locale: "uz" },
        after: { locale: "ru" },
        createdAt: new Date("2026-10-14T10:30:00Z"),
      },
    ]);
    expect(await auditRowsOf(other.id)).toEqual([]);
  });

  it("the same language again writes nothing: no audit row and the row unchanged (rule 13)", async () => {
    setClock("2026-10-14T09:00:00Z");
    const head = await insertUser("HEAD");
    setClock("2026-10-14T11:00:00Z");

    expect(await runAction(chooseOwnLanguage, head.id, { locale: "uz" })).toMatchObject({
      ok: true,
    });
    expect(await auditRowsOf(head.id)).toEqual([]);
    expect((await localeOf(head.id))?.updatedAt).toEqual(new Date("2026-10-14T09:00:00Z"));
  });

  it("a value that is not one of the three languages changes nothing (rule 13: Zod first)", async () => {
    const principal = await insertUser("PRINCIPAL");

    for (const locale of ["de", "", null, "RU"]) {
      expect(await runAction(chooseOwnLanguage, principal.id, { locale })).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
    expect((await localeOf(principal.id))?.locale).toBe("uz");
    expect(await auditRowsOf(principal.id)).toEqual([]);
  });

  it("a step after the audit row that fails leaves neither the locale nor the row (rule 3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const finance = await insertUser("FINANCE");
    const failing = defineAction({
      ...chooseOwnLanguage,
      async notify() {
        throw new Error("invented failure");
      },
    });

    expect(await runAction(failing, finance.id, { locale: "en" })).toMatchObject({
      ok: false,
      error: { code: "unexpected" },
    });
    expect((await localeOf(finance.id))?.locale).toBe("uz");
    expect(await auditRowsOf(finance.id)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("an inactive user is refused and nothing changes (decisions 0.8)", async () => {
    const inactive = await insertUser("MANAGER", { isActive: false });

    expect(await runAction(chooseOwnLanguage, inactive.id, { locale: "ru" })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect((await localeOf(inactive.id))?.locale).toBe("uz");
  });
});

describePermissionMatrix("chooseOwnLanguage", {
  permission: "profile.edit",
  async run({ user }) {
    const result = await runAction(chooseOwnLanguage, user.id, { locale: "en" });
    if (result.ok) return;
    const { code } = result.error;
    if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
    throw new Error(`Unexpected answer: ${code}`);
  },
});
