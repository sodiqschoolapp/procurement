import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

import { notifyFirstHead, refusalOf } from "../scripts/dev-notify.mjs";
import { setClock } from "./helpers/clock";
import { insertUser } from "./helpers/users";

// build-plan 0.11, Done when: "a development-only script gives the first Head one notification".
// Plan of 0.11, decision 11: development only, the local database only, no active Head refused.

async function withClient<T>(work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db.$client.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

describe("npm run dev:notify (plan of 0.11, decision 11)", () => {
  it("refuses production, a missing address and any database but the local one", () => {
    const local = "postgres://procurement@127.0.0.1:5433/procurement";
    expect(refusalOf({ DATABASE_URL: local })).toBeNull();
    expect(
      refusalOf({ DATABASE_URL: "postgres://procurement@localhost:5433/procurement" }),
    ).toBeNull();
    expect(refusalOf({ NODE_ENV: "production", DATABASE_URL: local })).toMatch(/development/);
    expect(refusalOf({})).toMatch(/DATABASE_URL/);
    expect(refusalOf({ DATABASE_URL: "postgres://user@db.example.com:25060/procurement" })).toMatch(
      /local/,
    );
    expect(
      refusalOf({ DATABASE_URL: "postgres://procurement@127.0.0.1:5432/procurement" }),
    ).toMatch(/local/);
    expect(refusalOf({ DATABASE_URL: "not an address" })).toMatch(/not an address/);
  });

  it("gives the first active Head one notification linking Home; an older inactive Head gets none", async () => {
    setClock("2026-10-14T07:59:00Z");
    // An older active person of another role is not "the first Head" (spec review of 0.11; D40).
    const olderManager = await insertUser("MANAGER");
    setClock("2026-10-14T08:00:00Z");
    const inactive = await insertUser("HEAD", { isActive: false });
    setClock("2026-10-14T08:01:00Z");
    const first = await insertUser("HEAD");
    setClock("2026-10-14T08:02:00Z");
    const later = await insertUser("HEAD");

    const username = await withClient((client) => notifyFirstHead(client as never));

    expect(username).toBe(first.username);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, first.id));
    expect(rows).toMatchObject([
      { type: "BRANCH_ROLE_VACANT", params: { branch: "DEMO", role: "PRINCIPAL" }, link: "/" },
    ]);
    for (const other of [olderManager, inactive, later]) {
      expect(
        await db.select().from(notifications).where(eq(notifications.userId, other.id)),
      ).toEqual([]);
    }
  });
});
