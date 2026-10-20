import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { accounts, auditLog, sessions } from "@/server/db/schema";
import { signIn } from "@/server/auth/sign-in";

import { renewHeadPassword } from "../scripts/head-password.mjs";
import { setClock } from "./helpers/clock";
import { insertUser, signInAs } from "./helpers/users";

// A Head's lost password, renewed from the hosting console (03-roles-and-permissions.md rule 4:
// "gets a new one from a command run in the hosting console, which signs that Head out everywhere
// and writes an audit row"; A8; D55 item 8; build-plan 8.2b, Done when: "the command renews a
// Head's password, signs that Head out and refuses an unknown or inactive username"; plan of 8.2b,
// decided item 9).

const MOMENT = new Date("2031-03-10T04:00:00Z");
const NEW_PASSWORD = "invented-renewed-password";

async function withClient<T>(work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db.$client.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

const renew = (username: string, password = NEW_PASSWORD) =>
  withClient((client) => renewHeadPassword(client, { username, password }, MOMENT));

async function sessionsOf(userId: string) {
  return db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
}

describe("npm run user:renew-head (03 rule 4; A8)", () => {
  it("renews an active Head's password, ends that Head's sessions on every device, and writes one audit row", async () => {
    setClock(MOMENT);
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    // Two devices of the Head, one of a second active Head (D40).
    await signInAs(head);
    await signInAs(head);
    await signInAs(other);
    expect(await sessionsOf(head.id)).toHaveLength(2);

    const renewed = await renew(` ${head.username.toUpperCase()} `);
    expect(renewed).toEqual({ id: head.id, username: head.username, sessionsEnded: 2 });

    expect(await sessionsOf(head.id)).toEqual([]);
    expect(await sessionsOf(other.id)).toHaveLength(1);
    expect((await signIn({ username: head.username, password: head.password })).ok).toBe(false);
    expect((await signIn({ username: head.username, password: NEW_PASSWORD })).ok).toBe(true);
    const [account] = await db.select().from(accounts).where(eq(accounts.userId, head.id));
    expect(account?.password).not.toContain(NEW_PASSWORD);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, head.id));
    expect(rows.filter((row) => row.action === "user.renew_password")).toEqual([
      {
        id: expect.any(String),
        actorId: head.id,
        action: "user.renew_password",
        entity: "users",
        entityId: head.id,
        before: {},
        after: {},
        createdAt: MOMENT,
      },
    ]);
  });

  it("refuses an unknown username, an inactive Head and an active Manager with one message, and changes nothing", async () => {
    setClock(MOMENT);
    const inactive = await insertUser("HEAD", { isActive: false });
    const manager = await insertUser("MANAGER");
    await signInAs(manager);
    for (const username of ["no_such_head", inactive.username, manager.username]) {
      await expect(renew(username)).rejects.toThrow("Refused: no active Head has this username.");
    }
    expect(await sessionsOf(manager.id)).toHaveLength(1);
    expect((await signIn({ username: manager.username, password: manager.password })).ok).toBe(
      true,
    );
    for (const user of [inactive, manager]) {
      const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, user.id));
      expect(rows.filter((row) => row.action === "user.renew_password")).toEqual([]);
    }
  });

  it("refuses an empty password, one over 4 096 characters, and a Head with no password account", async () => {
    setClock(MOMENT);
    const head = await insertUser("HEAD");
    await signInAs(head);
    await expect(renew(head.username, "")).rejects.toThrow("Refused: the password is empty.");
    await expect(renew(head.username, "x".repeat(4097))).rejects.toThrow(
      "Refused: a password is at most 4096 characters.",
    );
    expect(await sessionsOf(head.id)).toHaveLength(1);
    expect((await signIn({ username: head.username, password: head.password })).ok).toBe(true);

    const bare = await insertUser("HEAD");
    await db.delete(accounts).where(eq(accounts.userId, bare.id));
    await expect(renew(bare.username)).rejects.toThrow(
      "Refused: this Head has no password account.",
    );
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, bare.id));
    expect(rows.filter((row) => row.action === "user.renew_password")).toEqual([]);
  });
});
