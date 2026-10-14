import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";

import { db } from "@/server/db/client";
import { signIn } from "@/server/auth/sign-in";

import { createFirstHead } from "../scripts/first-head.mjs";
import { SEED_PASSWORD_VARIABLES, seed } from "../scripts/seed.mjs";
import { runTogether } from "./helpers/together";
import { createTestDatabase, dropTestDatabase } from "./helpers/test-database";

// build-plan 0.14 ("2 branches with invented names (one has the code CHL), one user per role …,
// passwords read from the local .env; safe to run twice"); developer-rules.md rule 14 (demo
// data). Plan of 0.14 and its review. Users and audit rows cannot be deleted, so every case that
// counts rows runs on a fresh database of its own, copied from the template.

const MOMENT = new Date("2031-04-02T05:00:00Z");
const ENV = {
  SEED_HEAD_PASSWORD: "invented-seed-head",
  SEED_MANAGER_PASSWORD: "invented-seed-manager",
  SEED_PRINCIPAL_PASSWORD: "invented-seed-principal",
  SEED_FINANCE_PASSWORD: "invented-seed-finance",
};
const TABLES = ["branches", "users", "accounts", "user_branches", "manager_rights", "audit_log"];

const serverUrl = inject("databaseServerUrl");
const made: string[] = [];

afterAll(async () => {
  for (const name of made) await dropTestDatabase(serverUrl, name);
});

/** Runs `work` with clients of a new database of its own, closed afterwards. */
async function withFreshDatabase<T>(
  work: (connect: () => Promise<pg.Client>) => Promise<T>,
): Promise<T> {
  const database = await createTestDatabase(serverUrl, { fromTemplate: true });
  made.push(database.name);
  const clients: pg.Client[] = [];
  try {
    return await work(async () => {
      const client = new pg.Client({ connectionString: database.url, options: "-c timezone=UTC" });
      await client.connect();
      clients.push(client);
      return client;
    });
  } finally {
    for (const client of clients) await client.end();
  }
}

async function counts(client: pg.Client): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await client.query<{ count: number }>(
      `select count(*)::int as count from ${table}`,
    );
    result[table] = rows.rows[0]?.count ?? -1;
  }
  return result;
}

const CREATED_LINES = [
  "created branch CHL",
  "created branch YUN",
  "created user seed_head",
  "created user seed_manager",
  "created user seed_principal",
  "created user seed_finance",
];

describe("npm run db:seed (build-plan 0.14; developer-rules.md rule 14)", () => {
  it("fills an empty database with 2 branches, one with code CHL, and one user per role", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();

      expect(await seed(client, ENV, MOMENT)).toEqual(CREATED_LINES);

      const branches = await client.query("select code, name from branches order by code");
      expect(branches.rows.map((row) => row.code)).toEqual(["CHL", "YUN"]);
      const users = await client.query<{ username: string; role: string; codes: string[] }>(
        `select u.username, u.role,
                coalesce(array_agg(b.code order by b.code) filter (where b.code is not null), '{}') as codes
           from users u
           left join user_branches ub on ub.user_id = u.id
           left join branches b on b.id = ub.branch_id
          group by u.username, u.role order by u.username`,
      );
      expect(users.rows).toEqual([
        { username: "seed_finance", role: "FINANCE", codes: ["CHL", "YUN"] },
        { username: "seed_head", role: "HEAD", codes: [] },
        { username: "seed_manager", role: "MANAGER", codes: ["CHL", "YUN"] },
        { username: "seed_principal", role: "PRINCIPAL", codes: ["CHL"] },
      ]);
      // "No row means enabled" (14-data-model.md): every Manager right is on.
      expect((await counts(client)).manager_rights).toBe(0);
    });
  });

  it("writes one audit row per branch and per user, the seed Head as actor, with no password", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      const rows = await client.query<{
        action: string;
        actor: string;
        after: Record<string, unknown>;
        created_at: Date;
      }>(
        `select a.action, u.username as actor, a.after, a.created_at
           from audit_log a join users u on u.id = a.actor_id order by a.action, a.entity_id`,
      );
      expect(rows.rows.map((row) => row.action).sort()).toEqual([
        "branch.create",
        "branch.create",
        "user.create",
        "user.create",
        "user.create",
        "user.create",
      ]);
      expect(new Set(rows.rows.map((row) => row.actor))).toEqual(new Set(["seed_head"]));
      expect(rows.rows.every((row) => row.created_at.getTime() === MOMENT.getTime())).toBe(true);
      const text = JSON.stringify(rows.rows.map((row) => row.after));
      for (const password of Object.values(ENV)) expect(text).not.toContain(password);
      expect(text).not.toMatch(/password|hash/i);
    });
  });

  it("is safe to run twice: the second run creates nothing and resets no password", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const before = await counts(client);
      const hashes = await client.query("select user_id, password from accounts order by user_id");

      const other = Object.fromEntries(Object.keys(ENV).map((name) => [name, "another-invented"]));
      expect(await seed(client, other, MOMENT)).toEqual(
        CREATED_LINES.map((line) => line.replace("created", "kept")),
      );

      expect(await counts(client)).toEqual(before);
      const after = await client.query("select user_id, password from accounts order by user_id");
      expect(after.rows).toEqual(hashes.rows);
    });
  });

  it("adds only what is missing to a partly seeded database and keeps the found rows", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      const head = await createFirstHead(
        client,
        {
          fullName: "Bahrom Namunaev",
          username: "seed_head",
          phone: "+998 90 000 98 01",
          password: "invented-x",
        },
        MOMENT,
      );
      await client.query(
        `insert into branches (name, code, address, is_active, created_at)
         values ('Invented CHL', 'CHL', 'Invented street', true, $1)`,
        [MOMENT],
      );

      expect(await seed(client, ENV, MOMENT)).toEqual([
        "kept branch CHL",
        "created branch YUN",
        "kept user seed_head",
        "created user seed_manager",
        "created user seed_principal",
        "created user seed_finance",
      ]);
      const chl = await client.query("select name, address from branches where code = 'CHL'");
      expect(chl.rows).toEqual([{ name: "Invented CHL", address: "Invented street" }]);
      const heads = await client.query("select id from users where role = 'HEAD'");
      expect(heads.rows).toEqual([{ id: head.id }]);
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("refuses a %s password variable, names it and writes nothing", async (_case, value) => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      const before = await counts(client);

      await expect(
        seed(client, { ...ENV, [SEED_PASSWORD_VARIABLES.PRINCIPAL]: value }, MOMENT),
      ).rejects.toThrow(/Refused: SEED_PRINCIPAL_PASSWORD is not set/);

      expect(await counts(client)).toEqual(before);
    });
  });

  it("refuses a found seed user of another role and writes nothing", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await client.query(
        `insert into users (id, full_name, username, display_username, email, phone, role, locale,
           is_active, created_at, updated_at)
         values (gen_random_uuid(), 'Invented Person', 'seed_manager', 'seed_manager',
           'seed-manager@users.invalid', '+998 90 000 97 01', 'FINANCE', 'uz', true, $1, $1)`,
        [MOMENT],
      );
      const before = await counts(client);

      await expect(seed(client, ENV, MOMENT)).rejects.toThrow(
        /seed_manager exists with the role FINANCE, not MANAGER/,
      );

      expect(await counts(client)).toEqual(before);
    });
  });

  it("refuses a missing seed Principal when CHL already has an active Principal", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await client.query("begin");
      const branch = await client.query(
        `insert into branches (name, code, address, is_active, created_at)
         values ('Invented CHL', 'CHL', 'Invented street', true, $1) returning id`,
        [MOMENT],
      );
      const user = await client.query(
        `insert into users (id, full_name, username, display_username, email, phone, role, locale,
           is_active, created_at, updated_at)
         values (gen_random_uuid(), 'Invented Principal', 'other_principal', 'other_principal',
           'other-principal@users.invalid', '+998 90 000 97 02', 'PRINCIPAL', 'uz', true, $1, $1)
         returning id`,
        [MOMENT],
      );
      await client.query(
        `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
         values ($1, $2, 'PRINCIPAL', true, $3)`,
        [user.rows[0].id, branch.rows[0].id, MOMENT],
      );
      await client.query("commit");
      const before = await counts(client);

      await expect(seed(client, ENV, MOMENT)).rejects.toThrow(
        "Refused: branch CHL already has an active Principal; seed_principal was not created. Nothing was written.",
      );

      expect(await counts(client)).toEqual(before);
    });
  });

  it("writes one set of rows when two seeds run at the same moment", async () => {
    await withFreshDatabase(async (connect) => {
      const first = await connect();
      const second = await connect();

      const outcomes = await runTogether([
        async (meet) => {
          await meet();
          return seed(first, ENV, MOMENT);
        },
        async (meet) => {
          await meet();
          return seed(second, ENV, MOMENT);
        },
      ]);

      expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
      const lines = outcomes.map((outcome) =>
        outcome.status === "fulfilled" ? outcome.value : [],
      );
      expect(lines).toContainEqual(CREATED_LINES);
      expect(lines).toContainEqual(CREATED_LINES.map((line) => line.replace("created", "kept")));
      const total = await counts(first);
      expect(total).toMatchObject({ branches: 2, users: 4, audit_log: 6 });
    });
  });

  it("adds seed_head beside a first Head, after which user:first-head refuses", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      await expect(
        createFirstHead(
          client,
          {
            fullName: "Invented Head",
            username: "invented_head",
            phone: "+998 90 000 97 03",
            password: "x",
          },
          MOMENT,
        ),
      ).rejects.toThrow(/a Head exists already/);

      const heads = await client.query("select username from users where role = 'HEAD'");
      expect(heads.rows).toEqual([{ username: "seed_head" }]);
    });

    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await createFirstHead(
        client,
        {
          fullName: "Invented Head",
          username: "invented_head",
          phone: "+998 90 000 97 03",
          password: "x",
        },
        MOMENT,
      );

      await seed(client, ENV, MOMENT);

      const heads = await client.query(
        "select username from users where role = 'HEAD' order by username",
      );
      expect(heads.rows).toEqual([{ username: "invented_head" }, { username: "seed_head" }]);
    });
  });

  it("lets each seed user sign in with the password of its variable, and refuses a wrong one", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
    } finally {
      client.release();
    }

    for (const [role, variable] of Object.entries(SEED_PASSWORD_VARIABLES)) {
      const username = `seed_${role.toLowerCase()}`;
      const result = await signIn({ username, password: ENV[variable] });
      expect(result.ok, username).toBe(true);
    }
    const wrong = await signIn({ username: "seed_head", password: ENV.SEED_MANAGER_PASSWORD });
    expect(wrong.ok).toBe(false);
  });
});
