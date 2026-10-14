import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { accounts, auditLog, users } from "@/server/db/schema";
import { signIn } from "@/server/auth/sign-in";

import { createFirstHead } from "../scripts/first-head.mjs";
import { setClock } from "./helpers/clock";
import { insertUser } from "./helpers/users";

// build-plan 0.6: "a script that creates the first Head with a password typed at the prompt";
// A8: the Head creates every other account. Plan of 0.6, decision 17.

const MOMENT = new Date("2031-03-10T04:00:00Z");
const INVENTED_HEAD = {
  fullName: "Aziza Testova",
  username: "Invented_Head",
  phone: "+998 90 000 00 01",
  password: "invented-first-password",
};

async function withClient<T>(work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db.$client.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

describe("the first Head (build-plan 0.6; A8)", () => {
  it("creates a Head who then signs in, with the password stored as a hash and an audit row", async () => {
    setClock(MOMENT);

    const created = await withClient((client) => createFirstHead(client, INVENTED_HEAD, MOMENT));

    expect(created.username).toBe("invented_head");
    const [head] = await db.select().from(users).where(eq(users.id, created.id));
    expect(head).toMatchObject({
      fullName: "Aziza Testova",
      username: "invented_head",
      role: "HEAD",
      isActive: true,
      email: `${created.id}@users.invalid`,
      createdAt: MOMENT,
    });
    const [account] = await db.select().from(accounts).where(eq(accounts.userId, created.id));
    expect(account?.providerId).toBe("credential");
    expect(account?.password).not.toContain(INVENTED_HEAD.password);

    const signedIn = await signIn({ username: "Invented_Head", password: INVENTED_HEAD.password });
    expect(signedIn.ok).toBe(true);

    // developer-rules.md rule 13 (a change to users goes to the audit log); progress 0.6, "For
    // 0.9"; plan of 0.9, decision 4: the first Head is the actor of its own row, written with
    // the user. Exactly the six fields of the plan: no password, no hash.
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(rows).toEqual([
      {
        id: expect.any(String),
        actorId: created.id,
        action: "user.create",
        entity: "users",
        entityId: created.id,
        before: null,
        after: {
          fullName: "Aziza Testova",
          username: "invented_head",
          phone: "+998 90 000 00 01",
          role: "HEAD",
          locale: "uz",
          isActive: true,
        },
        createdAt: MOMENT,
      },
    ]);
    expect(Object.keys(rows[0]!.after as object).sort()).toEqual([
      "fullName",
      "isActive",
      "locale",
      "phone",
      "role",
      "username",
    ]);
  });

  it("refuses when a Head exists, even an inactive one, and writes nothing", async () => {
    setClock(MOMENT);
    await insertUser("HEAD", { isActive: false });
    const auditRowsBefore = await db.select().from(auditLog);

    const refused = withClient((client) =>
      createFirstHead(client, { ...INVENTED_HEAD, username: "invented_second" }, MOMENT),
    );

    await expect(refused).rejects.toThrow("Refused: a Head exists already.");
    expect(await db.select().from(users).where(eq(users.username, "invented_second"))).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual(auditRowsBefore);
  });
});
