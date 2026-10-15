import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { loginAttempts, sessions, users } from "@/server/db/schema";

import { advanceClock, setClock } from "../../../tests/helpers/clock";
import { runTogether } from "../../../tests/helpers/together";
import { insertUser, signInAs } from "../../../tests/helpers/users";
import { getAuth } from "./auth";
import { userOfCookieValue } from "./session";
import { signIn, signOut } from "./sign-in";

// Signing in and sessions: A8 (Login), 13-technology.md (Login), developer-rules.md rule 13
// (Security), build-plan 0.6 "Done when". Every test fixes the clock at a literal moment years
// away from today, so a time the library took from its own clock could never pass.

const SIGNED_IN_AT = "2031-03-10T04:00:00Z";

async function attemptsOf(username: string) {
  return db
    .select({ succeeded: loginAttempts.succeeded, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(eq(loginAttempts.username, username))
    .orderBy(loginAttempts.createdAt);
}

describe("signing in (A8; build-plan 0.6)", () => {
  it("the right password signs in, and the session reads back (A8)", async () => {
    setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");

    const result = await signIn({ username: head.username, password: head.password });

    expect(result).toMatchObject({ ok: true, returnPath: "/" });
    if (!result.ok) return;
    // developer-rules.md rule 13: httpOnly and sameSite; Secure in production (session-cookie.test.ts).
    expect(result.cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const user = await userOfCookieValue(result.cookie.value);
    expect(user).toMatchObject({
      id: head.id,
      fullName: head.fullName,
      role: "HEAD",
      locale: "uz",
    });
  });

  it("writes the session's times from our clock: created now, ending exactly 24 hours later (CLAUDE.md rule 10; A8)", async () => {
    const moment = setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");

    await signInAs(head);

    const [session] = await db.select().from(sessions).where(eq(sessions.userId, head.id));
    expect(session?.createdAt).toEqual(moment);
    expect(session?.updatedAt).toEqual(moment);
    expect(session?.expiresAt).toEqual(new Date("2031-03-11T04:00:00Z"));
  });

  it("matches the username in any case (plan of 0.6, decision 11)", async () => {
    setClock(SIGNED_IN_AT);
    const manager = await insertUser("MANAGER");

    const result = await signIn({
      username: manager.username.toUpperCase(),
      password: manager.password,
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a wrong password, and an unknown username with the same answer (A8; plan, decision 6)", async () => {
    setClock(SIGNED_IN_AT);
    const manager = await insertUser("MANAGER");

    expect(await signIn({ username: manager.username, password: "invented-wrong" })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(await signIn({ username: "invented_nobody", password: "invented-wrong" })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(await db.select().from(sessions).where(eq(sessions.userId, manager.id))).toEqual([]);
  });

  it("signs in with a one-character password (A8: no password rules)", async () => {
    setClock(SIGNED_IN_AT);
    const finance = await insertUser("FINANCE", { password: "x" });

    expect((await signIn({ username: finance.username, password: "x" })).ok).toBe(true);
  });

  it("refuses an empty password and an empty username before anything is counted (developer-rules rule 13: Zod)", async () => {
    setClock(SIGNED_IN_AT);
    const finance = await insertUser("FINANCE");

    expect(await signIn({ username: finance.username, password: "" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn({ username: "  ", password: "x" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn({ username: "u".repeat(257), password: "x" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn("not an object")).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptsOf(finance.username)).toEqual([]);
  });

  it("gives a username the plugin refuses (too short, too long) the same answer, and counts it (plan, decision 11; review correction 6)", async () => {
    setClock(SIGNED_IN_AT);

    expect(await signIn({ username: "ab", password: "x" })).toEqual({ ok: false, reason: "wrong" });
    expect(await signIn({ username: "a".repeat(31), password: "x" })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(await attemptsOf("ab")).toEqual([
      { succeeded: false, createdAt: new Date(SIGNED_IN_AT) },
    ]);
    expect(await attemptsOf("a".repeat(31))).toHaveLength(1);
  });

  it("refuses an inactive user with the right password, and counts the try (A8; build-plan 0.6)", async () => {
    setClock(SIGNED_IN_AT);
    const principal = await insertUser("PRINCIPAL", { isActive: false });

    expect(await signIn({ username: principal.username, password: principal.password })).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(await attemptsOf(principal.username)).toEqual([
      { succeeded: false, createdAt: new Date(SIGNED_IN_AT) },
    ]);
  });

  it("refuses a user deactivated after sign-in at the next read (plan, decision 15)", async () => {
    setClock(SIGNED_IN_AT);
    const principal = await insertUser("PRINCIPAL");
    const cookie = await signInAs(principal);

    await db.update(users).set({ isActive: false }).where(eq(users.id, principal.id));

    expect(await userOfCookieValue(cookie.value)).toBeNull();
  });

  it("writes last_login_at on success only, and one try row per try", async () => {
    const moment = setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");

    await signIn({ username: head.username, password: "invented-wrong" });
    const [before] = await db
      .select({ at: users.lastLoginAt })
      .from(users)
      .where(eq(users.id, head.id));
    expect(before?.at).toBeNull();

    advanceClock({ minutes: 1 });
    await signInAs(head);
    const [after] = await db
      .select({ at: users.lastLoginAt })
      .from(users)
      .where(eq(users.id, head.id));
    expect(after?.at).toEqual(new Date(moment.getTime() + 60_000));
    expect(await attemptsOf(head.username)).toEqual([
      { succeeded: false, createdAt: moment },
      { succeeded: true, createdAt: new Date(moment.getTime() + 60_000) },
    ]);
  });

  it("returns only a path of this app to land on (edge-cases/system.md: back to the same page)", async () => {
    setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");

    const back = await signIn({ ...head, returnPath: "/orders?tab=x" });
    const away = await signIn({ ...head, returnPath: "//evil.example" });

    expect(back).toMatchObject({ ok: true, returnPath: "/orders?tab=x" });
    expect(away).toMatchObject({ ok: true, returnPath: "/" });
  });

  it("refuses sign-up through the library (13-technology.md: public sign-up off)", async () => {
    setClock(SIGNED_IN_AT);

    await expect(
      getAuth().api.signUpEmail({
        body: {
          name: "Invented Person",
          email: "invented@users.invalid",
          password: "x",
          username: "invented_new",
        } as never,
      }),
    ).rejects.toThrow("Email and password sign up is not enabled");
    expect(await db.select().from(users).where(eq(users.username, "invented_new"))).toEqual([]);
  });
});

describe("the limit of 5 tries per 15 minutes (developer-rules.md rule 13)", () => {
  it("refuses the 6th try after 5 wrong ones, even with the right password, until 15 minutes after the first", async () => {
    const first = setClock("2031-03-10T08:00:00Z");
    const manager = await insertUser("MANAGER");

    for (let i = 0; i < 5; i += 1) {
      expect((await signIn({ username: manager.username, password: "invented-wrong" })).ok).toBe(
        false,
      );
      advanceClock({ minutes: 1 });
    }

    setClock("2031-03-10T08:10:00Z");
    expect(await signIn({ username: manager.username, password: manager.password })).toEqual({
      ok: false,
      reason: "limit",
      minutes: 5,
    });
    // A try refused by the limit is not checked and writes no row.
    expect(await attemptsOf(manager.username)).toHaveLength(5);

    setClock(new Date(first.getTime() + 15 * 60_000));
    expect((await signIn({ username: manager.username, password: manager.password })).ok).toBe(
      true,
    );
  });

  it("lets the right password in after 4 wrong tries, with 5 wrong tries of another username beside them", async () => {
    setClock("2031-03-10T09:00:00Z");
    const manager = await insertUser("MANAGER");
    const other = await insertUser("MANAGER");

    for (let i = 0; i < 5; i += 1) {
      await signIn({ username: other.username, password: "invented-wrong" });
      if (i < 4) await signIn({ username: manager.username, password: "invented-wrong" });
    }
    expect(await attemptsOf(manager.username)).toHaveLength(4);
    expect((await attemptsOf(manager.username)).every((attempt) => !attempt.succeeded)).toBe(true);

    expect((await signIn({ username: manager.username, password: manager.password })).ok).toBe(
      true,
    );
    expect(await signIn({ username: other.username, password: other.password })).toMatchObject({
      ok: false,
      reason: "limit",
    });
  });

  it("takes six wrong tries at the same moment one at a time: exactly one is refused by the limit", async () => {
    setClock("2031-03-10T10:00:00Z");
    const manager = await insertUser("MANAGER");

    const results = await runTogether(
      Array.from({ length: 6 }, () => async (meet: () => Promise<void>) => {
        await meet();
        return signIn({ username: manager.username, password: "invented-wrong" });
      }),
    );

    const reasons = results.map((result) =>
      result.status === "fulfilled" && !result.value.ok ? result.value.reason : "error",
    );
    expect(reasons.filter((reason) => reason === "wrong")).toHaveLength(5);
    expect(reasons.filter((reason) => reason === "limit")).toHaveLength(1);
  });

  it(
    "finishes more sign-ins at once than the app's pool holds (review of the plan, correction 3)",
    { timeout: 60_000 },
    async () => {
      setClock("2031-03-10T11:00:00Z");
      const people = [];
      for (let i = 0; i < 12; i += 1) people.push(await insertUser("MANAGER"));

      const results = await runTogether(
        people.map((person) => async (meet: () => Promise<void>) => {
          await meet();
          return signIn({ username: person.username, password: person.password });
        }),
      );

      expect(results.map((result) => result.status === "fulfilled" && result.value.ok)).toEqual(
        people.map(() => true),
      );
    },
  );
});

describe("sessions (A8)", () => {
  it("is accepted at 23 h 59 min and refused at 24 h 1 min, and reading it does not move its end", async () => {
    setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");
    const cookie = await signInAs(head);
    const [before] = await db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, head.id));

    advanceClock({ hours: 23, minutes: 59 });
    expect(await userOfCookieValue(cookie.value)).toMatchObject({ id: head.id });

    advanceClock({ minutes: 2 });
    expect(await userOfCookieValue(cookie.value)).toBeNull();

    const [after] = await db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, head.id));
    expect(after).toEqual(before);
  });

  it("keeps two devices signed in together; signing out one leaves the other (A8: several devices)", async () => {
    setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");
    const phone = await signInAs(head);
    const laptop = await signInAs(head);

    const onPhone = await userOfCookieValue(phone.value);
    expect(onPhone).toMatchObject({ id: head.id });
    expect(await userOfCookieValue(laptop.value)).toMatchObject({ id: head.id });

    await signOut(onPhone!.sessionToken);

    expect(await userOfCookieValue(phone.value)).toBeNull();
    expect(await userOfCookieValue(laptop.value)).toMatchObject({ id: head.id });
  });

  it("reads a cookie with a wrong signature, and a signed token with no row, as signed out (rule 13)", async () => {
    setClock(SIGNED_IN_AT);
    const head = await insertUser("HEAD");
    const cookie = await signInAs(head);
    const [token] = cookie.value.split(".");

    expect(await userOfCookieValue(`${token}.AAAA`)).toBeNull();
    expect(await userOfCookieValue(token)).toBeNull();
    expect(await userOfCookieValue(`${cookie.value}x`)).toBeNull();

    await db.execute(sql`delete from sessions`);
    expect(await userOfCookieValue(cookie.value)).toBeNull();
  });
});
