import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import {
  catalogName,
  isCatalogName,
  isCompanyKind,
  isNote,
  isShortName,
  isTaxId,
} from "@/domain/catalogs";
import { businessDate, businessYear, nextBusinessDate } from "@/domain/business-date";
import {
  actionTotal,
  approvalCashRows,
  orderCashCount,
  plannedCash,
  settlementNet,
  settlementRows,
} from "@/domain/money-ledger";
import { actualTotal } from "@/domain/purchases";
import { businessMonth } from "@/domain/business-date";
import {
  ORDER_ACTIONS,
  ORDER_EVENT_TYPES,
  ORDER_MOVES,
  type OrderAction,
  checkMoves,
} from "@/domain/order-moves";
import type { Role } from "@/domain/permissions";
import { orderNumber } from "@/domain/order-numbers";
import { orderTotal } from "@/domain/order-totals";
import { nextBalance } from "@/domain/stock";
import { documentNumber } from "@/domain/stock-documents";
import { isDescription, isProductType } from "@/domain/products";
import { fullName, isFullName, isPhone, phone } from "@/domain/users";
import { createCompany } from "@/features/catalog/actions/companies";
import { createDepartment } from "@/features/catalog/actions/departments";
import { createProduct } from "@/features/catalog/actions/products";
import { createSubtype } from "@/features/catalog/actions/subtypes";
import { listProducts } from "@/features/catalog/queries/products";
import { writeSnapshots } from "@/features/orders/actions/submit-steps";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { countPendingSuggestions, listSuggestions } from "@/features/catalog/queries/suggestions";
import { getFinanceHome } from "@/features/home/queries/finance-home";
import { getHeadHome } from "@/features/home/queries/head-home";
import { listOrderGroups } from "@/features/orders/queries/order-list";
import { getStockDocument } from "@/features/warehouse/queries/document";
import { listStockDocuments } from "@/features/warehouse/queries/documents";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { signIn } from "@/server/auth/sign-in";

import { createFirstHead } from "../scripts/first-head.mjs";
import {
  SEED_CATALOGS,
  SEED_CATEGORIES,
  SEED_COMPANIES,
  SEED_DEPARTMENTS,
  SEED_EXTRA_COST_TYPES,
  SEED_MEASURES,
  SEED_PRODUCTS,
} from "../scripts/seed-catalogs.mjs";
import { SEED_ORDERS } from "../scripts/seed-orders.mjs";
import { SEED_SUGGESTION } from "../scripts/seed-catalogs.mjs";
import { SEED_STOCK, SEED_WRITE_OFF } from "../scripts/seed-stock.mjs";
import { SEED_PASSWORD_VARIABLES, seed } from "../scripts/seed.mjs";
import { resetClock, setClock } from "./helpers/clock";
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
const TABLES = [
  "branches",
  "users",
  "accounts",
  "user_branches",
  "manager_rights",
  "audit_log",
  "units",
  "categories",
  "extra_cost_types",
  "companies",
  "departments",
  "products",
  "product_variants",
  "price_history",
];

const serverUrl = inject("databaseServerUrl");
const made: string[] = [];

// The cleanup drops every fresh database one after another; with 27 of them (5.12 added one) it
// needs more than the default 10 s hook limit. It asserts nothing.
afterAll(async () => {
  for (const name of made) await dropTestDatabase(serverUrl, name);
}, 60_000);

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

      expect((await seed(client, ENV, MOMENT)).lines).toEqual(CREATED_LINES);

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
           from audit_log a join users u on u.id = a.actor_id
          where a.entity in ('branches', 'users') order by a.action, a.entity_id`,
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
      expect((await seed(client, other, MOMENT)).lines).toEqual(
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

      expect((await seed(client, ENV, MOMENT)).lines).toEqual([
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

  it("creates seed_principal when CHL has only an inactive Principal (D40: the check reads active ones)", async () => {
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
         values (gen_random_uuid(), 'Invented Former', 'former_principal', 'former_principal',
           'former-principal@users.invalid', '+998 90 000 97 04', 'PRINCIPAL', 'uz', false, $1, $1)
         returning id`,
        [MOMENT],
      );
      await client.query(
        `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
         values ($1, $2, 'PRINCIPAL', false, $3)`,
        [user.rows[0].id, branch.rows[0].id, MOMENT],
      );
      await client.query("commit");

      expect((await seed(client, ENV, MOMENT)).lines).toContain("created user seed_principal");

      const led = await client.query(
        `select u.username from user_branches ub join users u on u.id = ub.user_id
          where ub.branch_id = $1 and ub.user_role = 'PRINCIPAL' and ub.user_is_active`,
        [branch.rows[0].id],
      );
      expect(led.rows).toEqual([{ username: "seed_principal" }]);
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
        outcome.status === "fulfilled" ? outcome.value.lines : [],
      );
      expect(lines).toContainEqual(CREATED_LINES);
      expect(lines).toContainEqual(CREATED_LINES.map((line) => line.replace("created", "kept")));
      const total = await counts(first);
      expect(total).toMatchObject({ branches: 2, users: 4, audit_log: 81, products: 30 });
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

// build-plan 1.13 ("The seed gains measures, categories, extra cost types, companies, departments
// for both branches, and 30 products with subtypes and prices. All names are invented"; Done when:
// "the Head sees 30 products"); developer-rules.md rule 14. Plan of 1.13 and its review: the
// catalog outcome is returned by seed(), not printed (correction 1); the subtypes of a found
// product count as kept when found (correction 2).

const ALL_CREATED = [
  { catalog: "measures", created: 5, kept: 0 },
  { catalog: "categories", created: 6, kept: 0 },
  { catalog: "extra cost types", created: 3, kept: 0 },
  { catalog: "companies", created: 6, kept: 0 },
  { catalog: "departments", created: 7, kept: 0 },
  { catalog: "products", created: 30, kept: 0 },
  { catalog: "subtypes", created: 16, kept: 0 },
];
const ALL_KEPT = ALL_CREATED.map(({ catalog, created }) => ({
  catalog,
  created: 0,
  kept: created,
}));

async function auditAfter(
  client: pg.Client | pg.PoolClient,
  action: string,
  entity: string,
  where: string,
  values: unknown[],
): Promise<Record<string, unknown>> {
  const rows = await client.query<{ after: Record<string, unknown> }>(
    `select a.after from audit_log a where a.action = $1 and a.entity = $2
        and a.entity_id = (${where})::text`,
    [action, entity, ...values],
  );
  expect(rows.rows, `${action} ${JSON.stringify(values)}`).toHaveLength(1);
  return rows.rows[0]!.after;
}

describe("npm run db:seed: the catalogs (build-plan 1.13; developer-rules.md rule 14)", () => {
  it("fills an empty database with every catalog, 30 products and 16 subtypes, in one go", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();

      const result = await seed(client, ENV, MOMENT);

      expect(result.lines).toEqual(CREATED_LINES);
      expect(result.catalogs).toEqual(ALL_CREATED);
      expect(result.catalogs.map((row) => row.catalog)).toEqual(SEED_CATALOGS);
      expect(await counts(client)).toMatchObject({
        units: 5,
        categories: 6,
        extra_cost_types: 3,
        companies: 6,
        departments: 7,
        products: 30,
        // 24 hidden defaults and 16 real subtypes, each with one HEAD row.
        product_variants: 40,
        price_history: 40,
        // Then the direct entry of the warehouse documents (build-plan 5.12) and the product
        // suggestion of build plan 6.2.
        audit_log: 6 + 5 + 6 + 3 + 6 + 7 + 30 + 16 + 1 + 1,
      });
    });
  });

  it("every subtype has a price, held by its newest HEAD row, set by seed_head with no note (04 rules 1 and 4)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      const variants = await client.query<{
        product: string;
        has_variants: boolean;
        product_price: string | null;
        name: string;
        is_default: boolean;
        price: string | null;
        newest: string | null;
        source: string;
        note: string | null;
        set_by: string;
        created_at: Date;
      }>(
        `select p.name as product, p.has_variants, p.reference_price::text as product_price,
                v.name, v.is_default, v.reference_price::text as price,
                h.price::text as newest, h.source, h.note, u.username as set_by, h.created_at
           from product_variants v
           join products p on p.id = v.product_id
           join lateral (select * from price_history ph where ph.variant_id = v.id
                          order by ph.seq desc limit 1) h on true
           join users u on u.id = h.set_by`,
      );
      expect(variants.rows).toHaveLength(40);
      for (const row of variants.rows) {
        expect(row.price, row.product).not.toBeNull();
        expect(row.newest, row.product).toBe(row.price);
        expect(row).toMatchObject({ source: "HEAD", note: null, set_by: "seed_head" });
        expect(row.created_at.getTime()).toBe(MOMENT.getTime());
      }

      // Each listed product as written: with subtypes, the real ones and no price of its own;
      // without, one hidden default whose price the product holds too, as createProduct writes it.
      for (const product of SEED_PRODUCTS) {
        const rows = variants.rows.filter((row) => row.product === product.name);
        if (product.subtypes) {
          expect(rows.map((row) => [row.name, row.price, row.is_default]).sort()).toEqual(
            product.subtypes.map((subtype) => [subtype.name, String(subtype.price), false]).sort(),
          );
          expect(rows.every((row) => row.has_variants && row.product_price === null)).toBe(true);
        } else {
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            name: "default",
            is_default: true,
            has_variants: false,
            price: String(product.price),
            product_price: String(product.price),
          });
        }
      }
      expect(SEED_PRODUCTS.filter((product) => product.subtypes)).toHaveLength(6);
    });
  });

  it("gives both branches departments, with one name in each (04 rule 3: unique inside a branch)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      const rows = await client.query<{ code: string; name: string }>(
        `select b.code, d.name from departments d join branches b on b.id = d.branch_id
          order by b.code, d.name`,
      );
      // Each department in the branch it names (permission review, Should fix 1).
      expect(rows.rows.map((row) => [row.code, row.name]).sort()).toEqual(
        SEED_DEPARTMENTS.map((department) => [department.branch, department.name]).sort(),
      );
      expect(new Set(rows.rows.map((row) => row.code))).toEqual(new Set(["CHL", "YUN"]));
      expect(rows.rows.filter((row) => row.name === "Oshxona").map((row) => row.code)).toEqual([
        "CHL",
        "YUN",
      ]);
    });
  });

  it("holds measures with and without decimals, every company kind and both product types (04, Catalogs table)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      const decimals = await client.query("select distinct allow_decimal from units order by 1");
      expect(decimals.rows.map((row) => row.allow_decimal)).toEqual([false, true]);
      // In the order of the enum company_kind (0010).
      const kinds = await client.query("select distinct kind from companies order by 1");
      expect(kinds.rows.map((row) => row.kind)).toEqual(["BRAND", "SUPPLIER", "BOTH"]);
      const types = await client.query<{ type: string; count: number }>(
        "select type, count(*)::int as count from products group by type order by type",
      );
      expect(types.rows).toEqual([
        { type: "GOODS", count: 26 },
        { type: "SERVICE", count: 4 },
      ]);
    });
  });

  it("writes one audit row per created entry, the seed Head as actor, at the seed's moment (04 rule 9)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);

      const rows = await client.query<{ action: string; count: number; actors: string[] }>(
        `select a.action, count(*)::int as count, array_agg(distinct u.username) as actors
           from audit_log a join users u on u.id = a.actor_id
          where a.created_at = $1 group by a.action order by a.action`,
        [MOMENT],
      );
      expect(rows.rows).toEqual(
        [
          ["branch.create", 2],
          ["category.create", 6],
          ["company.create", 6],
          ["department.create", 7],
          ["extra_cost_type.create", 3],
          ["product.create", 30],
          ["subtype.create", 16],
          ["unit.create", 5],
          ["user.create", 4],
        ]
          .map(([action, count]) => ({ action, count, actors: ["seed_head"] }))
          // The Manager's product suggestion of build plan 6.2, as suggestProduct writes it.
          .concat([{ action: "suggestion.create", count: 1, actors: ["seed_manager"] }])
          .sort((a, b) => String(a.action).localeCompare(String(b.action))),
      );
      // Beside these, the direct entry's own row of build-plan 5.12, at its document's moment.
      const total = await client.query("select count(*)::int as count from audit_log");
      expect(total.rows[0].count).toBe(81);
    });
  });

  it("keeps everything on a second run: the same counts as kept, and no row added anywhere", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const before = await counts(client);

      const again = await seed(client, ENV, new Date("2031-04-03T05:00:00Z"));

      expect(again.catalogs).toEqual(ALL_KEPT);
      expect(await counts(client)).toEqual(before);
    });
  });

  it("keeps found entries as they are and adds only what is missing (plan of 1.13, decisions 4 and 5)", async () => {
    await withFreshDatabase(async (connect) => {
      // Entries of the seed that the Head made by hand before the seed ran.
      const fresh = await connect();
      {
        const head = await createFirstHead(
          fresh,
          {
            fullName: "Bahrom Namunaev",
            username: "seed_head",
            phone: "+998 90 000 98 01",
            password: "invented-x",
          },
          MOMENT,
        );
        await fresh.query("begin");
        const unit = await fresh.query(
          `insert into units (name, short_name, allow_decimal, is_active, created_at)
           values ('Dona', 'dona', false, true, $1) returning id`,
          [MOMENT],
        );
        const category = await fresh.query(
          `insert into categories (name, is_active, created_at)
           values ('kanselyariya', true, $1) returning id`,
          [MOMENT],
        );
        // A found active company is used by the new products that name it (spec review, Should fix 1).
        const company = await fresh.query(
          `insert into companies (name, kind, is_active, created_at)
           values ('Sinov Toza (demo)', 'BRAND', true, $1) returning id`,
          [MOMENT],
        );
        // "Ruchka" typed in another case with extra spaces, with only its hidden default and its
        // own price; "Qalam" as the seed lists it but at another price.
        const products = await fresh.query(
          `insert into products (name, type, category_id, unit_id, reference_price, has_variants,
             is_active, created_at)
           values ('  RUCHKA  ', 'GOODS', $1, $2, 3000, false, true, $3),
                  ('Qalam', 'GOODS', $1, $2, 1700, false, true, $3)
           returning id, reference_price`,
          [category.rows[0].id, unit.rows[0].id, MOMENT],
        );
        for (const product of products.rows) {
          const variant = await fresh.query(
            `insert into product_variants (product_id, name, is_default, reference_price, created_at)
             values ($1, 'default', true, $2, $3) returning id`,
            [product.id, product.reference_price, MOMENT],
          );
          await fresh.query(
            `insert into price_history (variant_id, price, source, set_by, created_at)
             values ($1, $2, 'HEAD', $3, $4)`,
            [variant.rows[0].id, product.reference_price, head.id, MOMENT],
          );
        }
        await fresh.query("commit");

        const result = await seed(fresh, ENV, MOMENT);

        expect(result.catalogs).toEqual([
          { catalog: "measures", created: 4, kept: 1 },
          { catalog: "categories", created: 5, kept: 1 },
          { catalog: "extra cost types", created: 3, kept: 0 },
          { catalog: "companies", created: 5, kept: 1 },
          { catalog: "departments", created: 7, kept: 0 },
          { catalog: "products", created: 28, kept: 2 },
          // Ruchka's three are neither added nor found: 16 - 3.
          { catalog: "subtypes", created: 13, kept: 0 },
        ]);
        const kept = await fresh.query(
          `select p.name, p.reference_price::text as price, p.has_variants,
                  array_agg(v.name order by v.name) as subtypes
             from products p join product_variants v on v.product_id = p.id
            where p.id = any($1::uuid[]) group by p.id order by lower(btrim(p.name))`,
          [products.rows.map((row) => row.id)],
        );
        expect(kept.rows).toEqual([
          { name: "Qalam", price: "1700", has_variants: false, subtypes: ["default"] },
          { name: "  RUCHKA  ", price: "3000", has_variants: false, subtypes: ["default"] },
        ]);
        const units = await fresh.query("select name from units where short_name = 'dona'");
        expect(units.rows).toEqual([{ name: "Dona" }]);
        // A new product of the seed points at the found category.
        const daftar = await fresh.query("select category_id from products where name = 'Daftar'");
        expect(daftar.rows[0].category_id).toBe(category.rows[0].id);
        const brand = await fresh.query(
          "select name from products where default_company_id = $1 order by name",
          [company.rows[0].id],
        );
        expect(brand.rows.map((row) => row.name)).toEqual(["Qo'lqop", "Suyuq sovun"]);
        // The two pen orders name the subtype "Ko'k", which the hand-made Ruchka lacks: they are
        // left out and the other five are made (plan of 2.15, decided item 5).
        const made = await seededOrders(fresh);
        expect(made).toHaveLength(SEED_ORDERS.length - 2);
        expect(made.every((row) => row.client_key !== SEED_ORDERS[0]!.clientKey)).toBe(true);
      }
    });
  });

  it("counts a listed subtype found under a found product as kept, and adds none (review correction 2)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      // Another subtype of a found product, made by the Head after the seed, is no seed subtype.
      const ruchka = await client.query("select id from products where name = 'Ruchka'");
      await client.query("begin");
      const extra = await client.query(
        `insert into product_variants (product_id, name, is_default, created_at)
         values ($1, 'Yashil', false, $2) returning id`,
        [ruchka.rows[0].id, MOMENT],
      );
      await client.query("commit");

      const again = await seed(client, ENV, MOMENT);

      expect(again.catalogs.find((row) => row.catalog === "subtypes")).toEqual({
        catalog: "subtypes",
        created: 0,
        kept: 16,
      });
      const names = await client.query(
        "select name from product_variants where product_id = $1 order by name",
        [ruchka.rows[0].id],
      );
      expect(names.rows.map((row) => row.name)).toEqual(["Ko'k", "Qizil", "Qora", "Yashil"]);
      expect(extra.rows).toHaveLength(1);
    });
  });

  it("keeps a measure found by its short name only, instead of clashing on the unique short name (0010)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await client.query(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ('Kilo', 'KG', true, true, $1)`,
        [MOMENT],
      );

      const result = await seed(client, ENV, MOMENT);

      expect(result.catalogs[0]).toEqual({ catalog: "measures", created: 4, kept: 1 });
      const guruch = await client.query(
        `select u.name from products p join units u on u.id = p.unit_id where p.name = 'Guruch'`,
      );
      expect(guruch.rows).toEqual([{ name: "Kilo" }]);
    });
  });

  it.each([
    [
      "an inactive category for a new product",
      `insert into categories (name, is_active, created_at) values ('Mebel', false, $1)`,
      'Refused: the category "Mebel" is inactive; the product "Stul" cannot use it. Nothing was written.',
    ],
    [
      "an inactive measure for a new product",
      `insert into units (name, short_name, allow_decimal, is_active, created_at)
       values ('litr', 'l', true, false, $1)`,
      'Refused: the measure "litr" is inactive; the product "Suyuq sovun" cannot use it. Nothing was written.',
    ],
    [
      "an inactive company for a new product",
      `insert into companies (name, kind, is_active, created_at)
       values ('Sinov Brend (demo)', 'BRAND', false, $1)`,
      'Refused: the company "Sinov Brend (demo)" is inactive; the product "Ruchka" cannot use it. Nothing was written.',
    ],
    [
      "an inactive branch for a new department",
      `insert into branches (name, code, address, is_active, created_at)
       values ('Invented YUN', 'YUN', 'Invented street', false, $1)`,
      'Refused: the branch YUN is inactive; the department "Oshxona" cannot be added to it. Nothing was written.',
    ],
  ])("refuses %s and writes nothing (04 rule 2)", async (_case, insert, message) => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await client.query(insert, [MOMENT]);
      const before = await counts(client);

      await expect(seed(client, ENV, MOMENT)).rejects.toThrow(message);

      expect(await counts(client)).toEqual(before);
    });
  });

  it("writes every value in the form the create actions store (plan of 1.13, decision 11)", () => {
    const stored = (value: string, valid: (value: string) => boolean) =>
      expect(catalogName(value) === value && valid(value), value).toBe(true);
    for (const measure of SEED_MEASURES) {
      stored(measure.name, isCatalogName);
      stored(measure.shortName, isShortName);
    }
    for (const name of [...SEED_CATEGORIES, ...SEED_EXTRA_COST_TYPES]) stored(name, isCatalogName);
    for (const company of SEED_COMPANIES) {
      stored(company.name, isCatalogName);
      expect(isCompanyKind(company.kind)).toBe(true);
      if (company.taxId !== null) expect(isTaxId(company.taxId), company.taxId).toBe(true);
      if (company.phone !== null) {
        expect(phone(company.phone) === company.phone && isPhone(company.phone)).toBe(true);
      }
      if (company.note !== null) expect(isNote(company.note)).toBe(true);
    }
    for (const department of SEED_DEPARTMENTS) {
      stored(department.name, isCatalogName);
      expect(fullName(department.responsibleName)).toBe(department.responsibleName);
      expect(isFullName(department.responsibleName)).toBe(true);
      expect(isPhone(department.responsiblePhone)).toBe(true);
    }
    expect(SEED_PRODUCTS).toHaveLength(30);
    for (const product of SEED_PRODUCTS) {
      stored(product.name, isCatalogName);
      expect(isProductType(product.type ?? "GOODS")).toBe(true);
      if (product.description) expect(isDescription(product.description)).toBe(true);
      // Whole so'm as a bigint, above zero (CLAUDE.md rule 6; the price CHECKs of 0013 and 0014).
      const prices = product.subtypes
        ? product.subtypes.map((subtype) => subtype.price)
        : [product.price];
      for (const price of prices) {
        expect(typeof price).toBe("bigint");
        expect(price! > 0n).toBe(true);
      }
      for (const subtype of product.subtypes ?? []) stored(subtype.name, isCatalogName);
    }
    // No two seed phones alike, and none of a seed user (CLAUDE.md, Conventions: invented).
    const phones = [
      ...SEED_COMPANIES.map((company) => company.phone).filter(Boolean),
      ...SEED_DEPARTMENTS.map((department) => department.responsiblePhone),
    ];
    expect(new Set(phones).size).toBe(phones.length);
  });
});

describe("the seed's catalogs in the app (build-plan 1.13, Done when)", () => {
  it("lets seed_head see 30 products, and its audit rows match the create actions' field for field", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
      const [head] = (
        await client.query<{ id: string }>("select id from users where username = 'seed_head'")
      ).rows;
      const headId = head!.id;

      // "By hand on the test copy: the Head sees 30 products."
      const page = await listProducts(headId);
      expect(page).toMatchObject({ found: 30, active: 30, inactive: 0 });

      // The same values through the create actions, under other names, give the same `after`
      // (04 rule 9; plan of 1.13, decision 3); prices as decimal text (CLAUDE.md rule 6).
      const a4 = SEED_PRODUCTS.find((product) => product.name === "A4 qog'oz")!;
      const ids = await client.query<Record<string, string>>(
        `select (select id from categories where name = $1) as category,
                (select id from units where name = $2) as unit,
                (select id from companies where name = $3) as company,
                (select id from categories where name = 'IT jihozlari') as it,
                (select id from units where name = 'dona') as dona,
                (select id from branches where code = 'CHL') as chl`,
        [a4.category, a4.measure, a4.company],
      );
      const ref = ids.rows[0]!;

      const madeProduct = await runAction(createProduct, headId, {
        clientKey: newClientKey(),
        name: "A4 qog'oz (action)",
        type: "GOODS",
        categoryId: ref.category,
        unitId: ref.unit,
        defaultCompanyId: ref.company,
        referencePrice: String(a4.price),
        description: a4.description,
      });
      expect(madeProduct).toMatchObject({ ok: true });
      const seedA4 = await auditAfter(
        client,
        "product.create",
        "products",
        "select id from products where name = $3",
        [a4.name],
      );
      const actionA4 = await auditAfter(
        client,
        "product.create",
        "products",
        "select id from products where name = $3",
        ["A4 qog'oz (action)"],
      );
      expect(seedA4).toEqual({ ...actionA4, name: a4.name });
      expect(seedA4.referencePrice).toBe("320000");

      // A product with subtypes: written as the Excel import writes it, no price of its own.
      const kabel = SEED_PRODUCTS.find((product) => product.name === "Kabel")!;
      const madeKabel = await runAction(createProduct, headId, {
        clientKey: newClientKey(),
        name: "Kabel (action)",
        type: "GOODS",
        categoryId: ref.it,
        unitId: ref.dona,
        defaultCompanyId: (
          await client.query("select id from companies where name = $1", [kabel.company])
        ).rows[0].id,
        referencePrice: "",
      });
      expect(madeKabel).toMatchObject({ ok: true });
      const kabelId = (madeKabel as { ok: true; data: { id: string } }).data.id;
      const seedKabel = await auditAfter(
        client,
        "product.create",
        "products",
        "select id from products where name = $3",
        ["Kabel"],
      );
      const actionKabel = await auditAfter(
        client,
        "product.create",
        "products",
        "select id::text from products where id = $3",
        [kabelId],
      );
      expect(seedKabel).toEqual({ ...actionKabel, name: "Kabel" });
      expect(seedKabel.referencePrice).toBeNull();

      // A subtype of a product that already has real ones: the first turns the default real, the
      // second is a new row, as each seed subtype is.
      const subtype = kabel.subtypes![0]!;
      for (const name of ["Birinchi", subtype.name]) {
        const added = await runAction(createSubtype, headId, {
          clientKey: newClientKey(),
          productId: kabelId,
          name,
          referencePrice: String(subtype.price),
        });
        expect(added).toMatchObject({ ok: true });
      }
      const seedSubtype = await auditAfter(
        client,
        "subtype.create",
        "product_variants",
        `select v.id from product_variants v join products p on p.id = v.product_id
          where p.name = 'Kabel' and v.name = $3`,
        [subtype.name],
      );
      const actionSubtype = await auditAfter(
        client,
        "subtype.create",
        "product_variants",
        "select id from product_variants where product_id = $3 and name = $4",
        [kabelId, subtype.name],
      );
      const seedKabelId = (await client.query("select id from products where name = 'Kabel'"))
        .rows[0].id;
      expect(seedSubtype).toEqual({ ...actionSubtype, productId: seedKabelId, product: "Kabel" });
      expect(seedSubtype.referencePrice).toBe(String(subtype.price));

      const company = SEED_COMPANIES.find((entry) => entry.note !== null)!;
      expect(
        await runAction(createCompany, headId, {
          clientKey: newClientKey(),
          ...company,
          name: "Kompaniya (action)",
        }),
      ).toMatchObject({ ok: true });
      expect(
        await auditAfter(
          client,
          "company.create",
          "companies",
          "select id from companies where name = $3",
          [company.name],
        ),
      ).toEqual({
        ...(await auditAfter(
          client,
          "company.create",
          "companies",
          "select id from companies where name = $3",
          ["Kompaniya (action)"],
        )),
        name: company.name,
      });

      const department = SEED_DEPARTMENTS[0]!;
      expect(
        await runAction(createDepartment, headId, {
          clientKey: newClientKey(),
          branchId: ref.chl,
          name: "Bo'lim (action)",
          responsibleName: department.responsibleName,
          responsiblePhone: department.responsiblePhone,
        }),
      ).toMatchObject({ ok: true });
      const where = "select id from departments where branch_id = $3 and name = $4";
      expect(
        await auditAfter(client, "department.create", "departments", where, [
          ref.chl,
          department.name,
        ]),
      ).toEqual({
        ...(await auditAfter(client, "department.create", "departments", where, [
          ref.chl,
          "Bo'lim (action)",
        ])),
        name: department.name,
      });
    } finally {
      client.release();
    }
  });
});

// build-plan 2.15: "The seed gains a few orders in different approval statuses, two of them in
// one group row"; plan of 2.15, decided item 5 (Look first), and the review of the plan,
// correction 4: the seed's SQL makes the numbers and dates and holds the totals as data, so every
// value is checked here against the domain function's own output (developer-rules.md rules 1, 2
// and 10).
const ORDER_TABLES = [
  "orders",
  "order_extras",
  "order_revisions",
  "order_actions",
  "order_events",
  "number_counters",
  "money_actions",
  "money_rows",
];

async function orderCounts(client: pg.Client): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of ORDER_TABLES) {
    const rows = await client.query<{ count: number }>(
      `select count(*)::int as count from ${table}`,
    );
    result[table] = rows.rows[0]?.count ?? -1;
  }
  return result;
}

type SeededOrder = {
  id: string;
  client_key: string;
  code: string;
  status: string;
  number: string | null;
  revision: number;
  planned_qty: string;
  planned_price: string;
  planned_total: string;
  payment_type: "CASH";
  needed_by: string;
  submitted_at: Date | null;
  extras: string[];
};

async function seededOrders(client: pg.Client): Promise<SeededOrder[]> {
  const rows = await client.query<SeededOrder>(
    `select o.id, o.client_key, b.code, o.status, o.number, o.revision, o.planned_qty::text,
            o.planned_price::text, o.planned_total::text, o.payment_type,
            to_char(o.needed_by, 'YYYY-MM-DD') as needed_by, o.submitted_at,
            coalesce((select array_agg(e.amount::text) from order_extras e where e.order_id = o.id),
                     '{}') as extras
       from orders o join branches b on b.id = o.branch_id
      where o.client_key = any($1::uuid[])`,
    [SEED_ORDERS.map((order) => order.clientKey)],
  );
  return rows.rows;
}

describe("npm run db:seed: the orders (build-plan 2.15; plan of 2.15, decided item 5)", () => {
  it("makes twelve orders in the planned statuses, each total equal to orderTotal()", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const rows = await seededOrders(client);
      expect(rows).toHaveLength(SEED_ORDERS.length);
      const byKey = new Map(rows.map((row) => [row.client_key, row]));
      for (const order of SEED_ORDERS) {
        const row = byKey.get(order.clientKey)!;
        expect(row.code).toBe(order.branch);
        expect(row.status).toBe(order.moves.at(-1)?.to ?? "DRAFT");
        expect(row.planned_total).toBe(
          orderTotal({
            quantity: row.planned_qty,
            price: BigInt(row.planned_price),
            extras: row.extras.map(BigInt),
            paymentType: row.payment_type,
          }).toString(),
        );
        let date = businessDate(MOMENT);
        for (let day = 0; day < order.neededInDays; day += 1) date = nextBusinessDate(date);
        expect(row.needed_by).toBe(date);
      }
      expect(new Set(rows.map((row) => row.status))).toEqual(
        new Set([
          "DRAFT",
          "PENDING_HEAD",
          "PENDING_PRINCIPAL",
          "PENDING_FINANCE",
          "RETURNED",
          // Money with managers (build plan 4.9).
          "PURCHASING",
          "CLOSED",
          // Finance's settlement entries and the Head's overspends (build plan 6.2).
          "SETTLEMENT",
        ]),
      );
    });
  });

  it("numbers each submitted order as orderNumber() does, from the branch's counter, the Draft none", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const rows = await seededOrders(client);
      expect(rows.filter((row) => row.status === "DRAFT").map((row) => row.number)).toEqual([null]);
      for (const code of ["CHL", "YUN"]) {
        const numbered = rows.filter((row) => row.code === code && row.number !== null);
        const year = businessYear(numbered[0]!.submitted_at!);
        expect(new Set(numbered.map((row) => businessYear(row.submitted_at!)))).toEqual(
          new Set([year]),
        );
        expect(numbered.map((row) => row.number).sort()).toEqual(
          numbered.map((_, at) => orderNumber(code, year, at + 1)),
        );
        const counter = await client.query<{ last_value: number }>(
          `select c.last_value from number_counters c join branches b on b.id = c.branch_id
            where c.scope = 'ORD' and b.code = $1 and c.year = $2`,
          [code, year],
        );
        expect(counter.rows).toEqual([{ last_value: numbered.length }]);
      }
    });
  });

  it("writes every move as the state machine allows it, and the status is the newest move's (CLAUDE.md rule 2)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      for (const row of await seededOrders(client)) {
        const events = await client.query<{
          type: string;
          from: string;
          to: string;
          comment: string | null;
          actor_id: string;
          created_at: Date;
        }>(
          `select type, from_status as from, to_status as to, comment, actor_id, created_at
             from order_events where order_id = $1 order by created_at, id`,
          [row.id],
        );
        const owner = await client.query<{ owner_id: string; branch_id: string; progress: string }>(
          "select owner_id, branch_id, progress from orders where id = $1",
          [row.id],
        );
        let at = "DRAFT";
        let buyingFinished = false;
        for (const event of events.rows) {
          expect(event.from).toBe(at);
          if (!(ORDER_ACTIONS as readonly string[]).includes(event.type)) {
            // A write that moves no status (plan of 3.3): the status stays.
            expect(ORDER_EVENT_TYPES as readonly string[]).toContain(event.type);
            expect(event.to).toBe(at);
            if (event.type === "MARK_NOT_BOUGHT") buyingFinished = true;
            // The seed's one purchase buys the whole plan (build plan 6.2): its record finishes
            // the buying, as recordPurchase's progress rule does.
            if (event.type === "RECORD_PURCHASE")
              buyingFinished = owner.rows[0]!.progress === "DONE";
            continue;
          }
          expect(
            ORDER_MOVES.some(
              (move) =>
                move.from === event.from && move.action === event.type && move.to === event.to,
            ),
          ).toBe(true);
          // checkMoves() of the state machine allows the move from the state before it, for the
          // actor who made it (review of the plan of 4.9, Must fix 2).
          const actor = await client.query<{ role: Role; branch_ids: string[] }>(
            `select u.role, coalesce(array_agg(ub.branch_id) filter (where ub.branch_id is not null),
                                     '{}') as branch_ids
               from users u left join user_branches ub on ub.user_id = u.id
              where u.id = $1 group by u.id`,
            [event.actor_id],
          );
          const rows = await client.query<{ kind: string; amount: string }>(
            `select r.kind, r.amount::text as amount from money_rows r
               join money_actions a on a.id = r.money_action_id
              where r.order_id = $1 and r.created_at < $2 and not a.is_cancelled`,
            [row.id, event.created_at],
          );
          const count = orderCashCount(
            rows.rows.map((each) => ({
              kind: each.kind as "CASH_GIVEN",
              amount: BigInt(each.amount),
              isCancelled: false,
            })),
            [],
          );
          const check = checkMoves(
            {
              userId: event.actor_id,
              role: actor.rows[0]!.role,
              branchIds: actor.rows[0]!.role === "HEAD" ? [] : actor.rows[0]!.branch_ids,
              disabledRights: [],
            },
            [
              {
                id: row.id,
                status: event.from as never,
                branchId: owner.rows[0]!.branch_id,
                ownerId: owner.rows[0]!.owner_id,
                createdByHead: false,
                buyingFinished,
                exactMatch: false,
                ownerClosesAlone: true,
                // 08 Closing 3: the seed closes only an order with no purchase, no transfer or card
                // block and no overspend.
                readyToClose: count === 0n,
              },
            ],
            event.type as OrderAction,
            { reason: event.comment ?? undefined },
          );
          expect(check.ok).toBe(true);
          at = event.to;
        }
        expect(row.status).toBe(at);
        const revisions = await client.query("select 1 from order_revisions where order_id = $1", [
          row.id,
        ]);
        expect(revisions.rowCount).toBe(row.status === "DRAFT" ? 0 : 1);
      }
    });
  });

  it("writes money as the actions do: each action dated its order action's Tashkent day and naming it; approved_at and closed_at at their moves (build plan 4.9; plan of 4.9, decided item 9)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const money = await client.query<{
        occurred_on: string;
        comment: string | null;
        client_key: string;
        type: string;
        acted_at: Date;
        kind: string;
        amount: string;
        order_id: string;
        manager_ok: boolean;
      }>(
        `select to_char(a.occurred_on, 'YYYY-MM-DD') as occurred_on, a.comment, a.client_key,
                oa.type, oa.created_at as acted_at, r.kind, r.amount::text as amount, r.order_id,
                (a.manager_id = o.owner_id and a.created_by = oa.actor_id
                 and a.created_at = oa.created_at and a.client_key = oa.client_key) as manager_ok
           from money_actions a
           join order_actions oa on oa.id = a.order_action_id
           join money_rows r on r.money_action_id = a.id
           join orders o on o.id = r.order_id`,
      );
      // Four of build plan 4.9, and the cash given to the two Settlement orders of 6.2.
      expect(money.rows).toHaveLength(6);
      for (const row of money.rows) {
        expect(row.occurred_on).toBe(businessDate(row.acted_at));
        expect(row.manager_ok).toBe(true);
        if (row.type === "APPROVE") {
          expect(row.kind).toBe("CASH_GIVEN");
          expect(row.comment).toBeNull();
        } else {
          expect([row.type, row.kind]).toEqual(["RECORD_MONEY", "CASH_RETURNED"]);
          expect(row.comment).not.toBeNull();
        }
      }
      const dates = await client.query<{
        status: string;
        approved_ok: boolean;
        closed_ok: boolean;
        progress: string;
      }>(
        `select o.status, o.progress,
                o.approved_at is not distinct from (select e.created_at from order_events e
                  where e.order_id = o.id and e.type = 'APPROVE' and e.to_status = 'PURCHASING')
                  as approved_ok,
                o.closed_at is not distinct from (select e.created_at from order_events e
                  where e.order_id = o.id and e.type = 'CLOSE') as closed_ok
           from orders o where o.client_key = any($1::uuid[])`,
        [SEED_ORDERS.map((order) => order.clientKey)],
      );
      for (const row of dates.rows) {
        expect(row).toMatchObject({ approved_ok: true, closed_ok: true });
      }
      expect(dates.rows.filter((row) => row.status === "CLOSED")).toEqual([
        { status: "CLOSED", progress: "NOT_BOUGHT", approved_ok: true, closed_ok: true },
      ]);
    });
  });

  it("adds nothing on a second run, nor on a run in the next year (CLAUDE.md rule 8)", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const first = await orderCounts(client);
      await seed(client, ENV, MOMENT);
      expect(await orderCounts(client)).toEqual(first);
      await seed(client, ENV, new Date("2032-01-02T05:00:00Z"));
      expect(await orderCounts(client)).toEqual(first);
    });
  });
});

describe("the seed's orders in the app (build-plan 2.15)", () => {
  it("shows seed_head the two CHL pen orders as one group row, and each copy equals writeSnapshots()", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
      const [head] = (
        await client.query<{ id: string }>("select id from users where username = 'seed_head'")
      ).rows;
      const page = await listOrderGroups(head!.id);
      const pens = page.groups.filter(
        (group) =>
          group.branchCode === "CHL" &&
          group.productName === "Ruchka" &&
          group.subtypeName === "Ko'k" &&
          group.status === "PENDING_HEAD",
      );
      expect(pens).toHaveLength(1);
      expect(pens[0]!.orders).toHaveLength(2);

      // The seed's copy of each submitted plan is the one the Submit action writes.
      for (const row of await seededOrders(client)) {
        if (row.status === "DRAFT") continue;
        const copies = await db
          .transaction(async (tx) => {
            await writeSnapshots(tx, [row.id], MOMENT);
            const read = await tx.execute<{ submission: number; snapshot: unknown }>(
              sql`select submission, snapshot from order_revisions
                   where order_id = ${row.id} order by submission`,
            );
            throw new Rollback(read.rows);
          })
          .catch((error: unknown) => {
            if (error instanceof Rollback) return error.rows;
            throw error;
          });
        expect(copies.map((copy) => copy.submission)).toEqual([1, 2]);
        expect(copies[0]!.snapshot).toEqual(copies[1]!.snapshot);
      }
    } finally {
      client.release();
    }
  });
});

describe("the seed's money in the app (build plan 4.9, Done when: the seed shows one Manager holding money; build plan 6.2)", () => {
  it("shows seed_head seed_manager holding the cash of the two Open orders and the Not bought settlement, owed the overspent one, since the oldest approval; the Closed one is not behind it", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
      const users = await client.query<{ username: string; id: string }>(
        "select username, id from users where username in ('seed_head', 'seed_manager')",
      );
      const idOf = (name: string) => users.rows.find((row) => row.username === name)!.id;
      const blocks = await getMoneyWithManagers(idOf("seed_head"), null);
      const block = blocks.find((each) => each.ownerId === idOf("seed_manager"))!;
      const behind = await client.query<{ id: string; status: string; approved_at: Date }>(
        `select id, status, approved_at from orders
          where client_key = any($1::uuid[]) and status in ('PURCHASING', 'SETTLEMENT')
          order by approved_at`,
        [SEED_ORDERS.map((order) => order.clientKey)],
      );
      // Two Open orders of build plan 4.9, two Waiting for settlement of 6.2.
      expect(behind.rows.map((row) => row.status).sort()).toEqual([
        "PURCHASING",
        "PURCHASING",
        "SETTLEMENT",
        "SETTLEMENT",
      ]);
      // Held: 60 000 + 60 000 (Open) + 60 000 (not bought); owed: 250 000 spent − 100 000 given.
      expect(block).toMatchObject({
        held: 180_000n,
        owed: 150_000n,
        since: businessDate(behind.rows[0]!.approved_at),
      });
      expect(block.orders.map((order) => order.id).sort()).toEqual(
        behind.rows.map((row) => row.id).sort(),
      );
    } finally {
      client.release();
    }
  });
});

/** Undoes the transaction of a check while carrying its rows out. */
class Rollback extends Error {
  constructor(readonly rows: { submission: number; snapshot: unknown }[]) {
    super("rollback");
  }
}

describe("npm run db:seed: the warehouse documents (build-plan 5.12; plan of 5.12, decided item 9)", () => {
  it("makes a direct entry and an issue of CHL, numbered by documentNumber(), each movement and balance what nextBalance() gives, and a second run adds nothing", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const documents = await client.query<{
        id: string;
        number: string;
        type: "DIRECT_ENTRY" | "ISSUE";
        status: string;
        doc_date: string;
        code: string;
        department: string | null;
        received_by_name: string | null;
        reason: string | null;
        username: string;
      }>(
        `select d.id, d.number, d.type, d.status, d.doc_date::text, b.code, dep.name as department,
           d.received_by_name, d.reason, u.username
         from stock_documents d join branches b on b.id = d.branch_id
         join users u on u.id = d.created_by
         left join departments dep on dep.id = d.department_id and dep.branch_id = d.branch_id
         where d.client_key = any($1::uuid[]) order by d.created_at`,
        [[SEED_STOCK.directEntry.clientKey, SEED_STOCK.issue.clientKey]],
      );
      const year = businessYear(MOMENT);
      expect(documents.rows).toEqual([
        expect.objectContaining({
          number: documentNumber("DIRECT_ENTRY", "CHL", year, 1),
          type: "DIRECT_ENTRY",
          status: "POSTED",
          doc_date: businessDate(MOMENT),
          code: "CHL",
          department: null,
          reason: "EXISTING_STOCK",
          username: "seed_head",
        }),
        expect.objectContaining({
          number: documentNumber("ISSUE", "CHL", year, 1),
          type: "ISSUE",
          status: "POSTED",
          doc_date: businessDate(MOMENT),
          code: "CHL",
          department: SEED_STOCK.issue.department,
          received_by_name: SEED_STOCK.issue.receivedByName,
          reason: null,
          username: "seed_manager",
        }),
      ]);

      // Every movement, in order, against the domain's arithmetic from an empty stock.
      const movements = await client.query<{
        variant_id: string;
        type: "DIRECT_ENTRY" | "ISSUE";
        qty_delta: string;
        unit_cost: string;
        balance_after: string;
      }>(
        `select m.variant_id, m.type, m.qty_delta::text, m.unit_cost::text,
           m.balance_after::text
         from stock_movements m join stock_document_lines l on l.id = m.document_line_id
         where l.document_id = any($1::uuid[]) order by m.seq`,
        [documents.rows.map((row) => row.id)],
      );
      expect(movements.rows).toHaveLength(4);
      const balances = new Map<string, { qty: string; avgCost: bigint }>();
      for (const movement of movements.rows) {
        const before = balances.get(movement.variant_id) ?? { qty: "0", avgCost: 0n };
        const lineCost = movement.type === "DIRECT_ENTRY" ? BigInt(movement.unit_cost) : null;
        const next = nextBalance(before, {
          type: movement.type,
          qtyDelta: movement.qty_delta,
          unitCost: lineCost,
        });
        expect(next.ok).toBe(true);
        if (!next.ok) continue;
        expect(Number(movement.balance_after)).toBe(Number(next.qty));
        expect(BigInt(movement.unit_cost)).toBe(next.unitCost);
        balances.set(movement.variant_id, { qty: next.qty, avgCost: next.avgCost });
      }
      const stored = await client.query<{ variant_id: string; qty: string; avg_cost: string }>(
        `select sb.variant_id, sb.qty::text, sb.avg_cost::text from stock_balances sb
           join branches b on b.id = sb.branch_id where b.code = 'CHL'`,
      );
      expect(stored.rows).toHaveLength(balances.size);
      for (const row of stored.rows) {
        const expected = balances.get(row.variant_id)!;
        expect(Number(row.qty)).toBe(Number(expected.qty));
        expect(BigInt(row.avg_cost)).toBe(expected.avgCost);
      }

      const audits = await client.query<{ action: string; entity_id: string }>(
        "select action, entity_id from audit_log where entity = 'stock_documents'",
      );
      expect(audits.rows).toEqual([
        { action: "direct_entry.create", entity_id: documents.rows[0]!.id },
      ]);

      const counts = async () =>
        (
          await client.query<{ documents: number; movements: number; counters: number }>(
            `select (select count(*)::int from stock_documents) as documents,
               (select count(*)::int from stock_movements) as movements,
               (select sum(last_value)::int from number_counters
                 where scope in ('ENT', 'ISS', 'WOF')) as counters`,
          )
        ).rows[0];
      const first = await counts();
      // Beside them, the pending write-off of build plan 6.2: a document and a counter, no movement.
      expect(first).toEqual({ documents: 3, movements: 4, counters: 3 });
      await seed(client, ENV, MOMENT);
      expect(await counts()).toEqual(first);
    });
  });
});

describe("the seed's warehouse documents in the app (build-plan 5.12)", () => {
  it("lists both for seed_manager, the issue under its department, and opens each", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
      const [manager] = (
        await client.query<{ id: string }>("select id from users where username = 'seed_manager'")
      ).rows;
      const page = await listStockDocuments(manager!.id, {}, 1);
      const types = page.rows
        .filter((row) => row.branchCode === "CHL")
        .map((row) => [row.type, row.departmentName]);
      expect(types).toEqual(
        expect.arrayContaining([
          ["ISSUE", SEED_STOCK.issue.department],
          ["DIRECT_ENTRY", null],
        ]),
      );
      for (const row of page.rows) {
        expect((await getStockDocument(manager!.id, row.id))?.number).toBe(row.number);
      }
    } finally {
      client.release();
    }
  });
});

describe("npm run db:seed: what waits for the Head (build plan 6.2; plan of 6.2, decided item 9)", () => {
  it("writes a pending write-off of CHL with its line and no movement, and a pending suggestion with its audit row; a second run adds nothing", async () => {
    await withFreshDatabase(async (connect) => {
      const client = await connect();
      await seed(client, ENV, MOMENT);
      const writeOff = await client.query(
        `select d.number, d.type, d.status, d.reason, d.comment, d.doc_date::text, u.username,
           (select count(*)::int from stock_document_lines l where l.document_id = d.id) as lines,
           (select count(*)::int from stock_movements m join stock_document_lines l
              on l.id = m.document_line_id where l.document_id = d.id) as movements
         from stock_documents d join users u on u.id = d.created_by where d.client_key = $1`,
        [SEED_WRITE_OFF.clientKey],
      );
      expect(writeOff.rows).toEqual([
        {
          number: documentNumber("WRITE_OFF", "CHL", businessYear(MOMENT), 1),
          type: "WRITE_OFF",
          status: "PENDING_APPROVAL",
          reason: SEED_WRITE_OFF.reason,
          comment: SEED_WRITE_OFF.comment,
          doc_date: businessDate(MOMENT),
          username: "seed_manager",
          lines: 1,
          movements: 0,
        },
      ]);
      const suggestion = await client.query(
        `select s.status, s.name, u.username,
           (select count(*)::int from audit_log a
             where a.entity_id = s.id::text and a.action = 'suggestion.create') as audits
         from catalog_suggestions s join users u on u.id = s.suggested_by where s.client_key = $1`,
        [SEED_SUGGESTION.clientKey],
      );
      expect(suggestion.rows).toEqual([
        { status: "PENDING", name: SEED_SUGGESTION.name, username: "seed_manager", audits: 1 },
      ]);
      const total = async () =>
        (
          await client.query(
            `select (select count(*)::int from stock_documents) as documents,
               (select count(*)::int from catalog_suggestions) as suggestions,
               (select count(*)::int from purchases) as purchases`,
          )
        ).rows[0];
      const first = await total();
      await seed(client, ENV, MOMENT);
      expect(await total()).toEqual(first);
    });
  });
});

describe("the seed's home lists (build plan 6.2, Done when: a database test checks each list against the seed)", () => {
  it("gives seed_head and seed_finance each list with the seed's own orders, documents and amounts", async () => {
    const client = await db.$client.connect();
    try {
      await seed(client, ENV, MOMENT);
      setClock(MOMENT);
      const ids = new Map(
        (
          await client.query<{ username: string; id: string }>(
            "select username, id from users where username like 'seed\\_%'",
          )
        ).rows.map((row) => [row.username, row.id]),
      );
      const branches = new Map(
        (
          await client.query<{ code: string; id: string }>(
            "select code, id from branches where code in ('CHL', 'YUN')",
          )
        ).rows.map((row) => [row.code, row.id]),
      );
      const orders = new Map(
        (
          await client.query<{ client_key: string; id: string }>(
            "select client_key, id from orders where client_key = any($1::uuid[])",
            [SEED_ORDERS.map((order) => order.clientKey)],
          )
        ).rows.map((row) => [row.client_key, row.id]),
      );
      const seedOrder = (at: number) => orders.get(SEED_ORDERS[at]!.clientKey)!;
      const seedBranches = [branches.get("CHL")!, branches.get("YUN")!];

      const head = await getHeadHome(ids.get("seed_head")!, null);
      // Waiting for Head: the two pen orders of CHL in one group row, and YUN's one.
      expect(
        head.waiting.lines
          .filter((line) => seedBranches.includes(line.branchId))
          .map((line) => [line.branchCode, line.count]),
      ).toEqual([
        ["CHL", 2],
        ["YUN", 1],
      ]);
      const pens = head.waiting.groups.groups.find((group) =>
        group.orders.some((order) => order.id === seedOrder(0)),
      )!;
      expect(pens.orders.map((order) => order.id).sort()).toEqual(
        [seedOrder(0), seedOrder(1)].sort(),
      );
      // Overspends: the service bought for 250 000 against 100 000 (08 Overspend guard).
      expect(head.overspends.filter((row) => row.id === seedOrder(11))).toEqual([
        expect.objectContaining({
          id: seedOrder(11),
          branchCode: "CHL",
          over: 150_000n,
          percent: "150.0",
        }),
      ]);
      expect(head.overspends.map((row) => row.id)).not.toContain(seedOrder(10));
      // Write-offs and suggestions: the seed's own.
      const writeOff = await client.query<{ id: string }>(
        "select id from stock_documents where client_key = $1",
        [SEED_WRITE_OFF.clientKey],
      );
      expect(head.writeOffs.lines.map((line) => line.id)).toContain(writeOff.rows[0]!.id);
      expect(await countPendingSuggestions(ids.get("seed_head")!)).toBeGreaterThanOrEqual(1);
      expect(
        (await listSuggestions(ids.get("seed_head")!)).rows
          .filter((row) => row.status === "PENDING")
          .map((row) => row.name),
      ).toContain(SEED_SUGGESTION.name);
      // Stuck: only the Waiting for Principal order, three days old; the others are hours old.
      expect(
        head.stuck.groups
          .flatMap((group) => group.orders.map((order) => order.id))
          .filter((id) => [...orders.values()].includes(id)),
      ).toEqual([seedOrder(2)]);
      // Counts per branch: the seed's statuses, Draft left out.
      for (const code of ["CHL", "YUN"]) {
        const expected = new Map<string, number>();
        for (const order of SEED_ORDERS.filter((each) => each.branch === code)) {
          const status = order.moves.at(-1)?.to ?? "DRAFT";
          if (status !== "DRAFT") expected.set(status, (expected.get(status) ?? 0) + 1);
        }
        const figures = head.branches.find((each) => each.branchCode === code)!;
        expect(new Map(figures.byStatus.map((row) => [row.status, row.count]))).toEqual(expected);
      }
      // Spending this month: actualTotal() of the seed's live records of this Tashkent month
      // (review of the plan, correction 1).
      const month = businessMonth(businessDate(MOMENT));
      expect(head.month).toEqual(month);
      const records = await client.query<{
        code: string;
        qty: string;
        unit_price: string;
        is_cancelled: boolean;
      }>(
        `select b.code, p.qty::text, p.unit_price::text, p.is_cancelled
           from purchases p join purchase_trips t on t.id = p.trip_id
           join branches b on b.id = p.branch_id
          where t.purchased_on between $1::date and $2::date`,
        [month.first, month.last],
      );
      for (const code of ["CHL", "YUN"]) {
        const spent = actualTotal(
          records.rows
            .filter((row) => row.code === code)
            .map((row) => ({
              qty: row.qty,
              unitPrice: BigInt(row.unit_price),
              extras: [],
              isCancelled: row.is_cancelled,
            })),
        );
        expect(head.branches.find((each) => each.branchCode === code)!.spending).toBe(spent);
      }
      expect(head.branches.find((each) => each.branchCode === "CHL")!.spending).toBe(250_000n);

      const finance = await getFinanceHome(ids.get("seed_finance")!, null);
      // Approvals: seed_manager in CHL with the one Waiting for Finance order, its cash prefill.
      const pending = SEED_ORDERS[3]!;
      expect(
        finance.approvals.map((entry) => [entry.ownerName, entry.branchCode, entry.count]),
      ).toEqual([[expect.any(String), "CHL", 1]]);
      expect(finance.approvals[0]!.ownerId).toBe(ids.get("seed_manager"));
      expect(finance.approvals[0]!.cashToGive).toBe(
        actionTotal(
          approvalCashRows([
            {
              id: seedOrder(3),
              ownerId: ids.get("seed_manager")!,
              amount: plannedCash({
                quantity: pending.quantity,
                price: pending.price,
                extras: pending.extras.map((extra) => extra.amount),
                paymentType: "CASH",
              }),
            },
          ]).flatMap((block) => block.rows),
        ),
      );
      // Settlements: the two Waiting for settlement orders, Receive 60 000 and Pay 150 000.
      expect(finance.settlements).toHaveLength(1);
      expect(finance.settlements[0]).toMatchObject({
        ownerId: ids.get("seed_manager"),
        branchCode: "CHL",
        count: 2,
        net: settlementNet(
          settlementRows([
            { id: seedOrder(10), cashCount: 60_000n },
            { id: seedOrder(11), cashCount: -150_000n },
          ]),
        ),
      });
      expect(finance.settlements[0]!.net).toEqual({ direction: "TO_MANAGER", amount: 90_000n });
    } finally {
      resetClock();
      client.release();
    }
  });
});
