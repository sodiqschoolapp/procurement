// The core of `npm run db:seed` (build-plan 0.14; developer-rules.md rule 14: "A seed script
// creates 2 branches, one user per role, …, so every phase can be clicked through"). The command
// line is scripts/db-seed.mjs. Every name, phone and address here is invented (CLAUDE.md,
// Conventions). Later tasks extend the seed with their own rows.
import { insertAuditRow } from "../src/server/audit-row.mjs";
import { insertPasswordUser } from "../src/server/auth/password-user.mjs";
import { FIRST_HEAD_LOCK } from "./first-head.mjs";

/** The variable of the local .env that holds each seed user's password (plan of 0.14, decision 3). */
export const SEED_PASSWORD_VARIABLES = /** @type {const} */ ({
  HEAD: "SEED_HEAD_PASSWORD",
  MANAGER: "SEED_MANAGER_PASSWORD",
  PRINCIPAL: "SEED_PRINCIPAL_PASSWORD",
  FINANCE: "SEED_FINANCE_PASSWORD",
});

/** Two branches; CHL is the branch of the acceptance scenarios (15-quality-and-acceptance.md). */
export const SEED_BRANCHES = [
  { code: "CHL", name: "Chilonzor (demo)", address: "Namuna ko'chasi 1" },
  { code: "YUN", name: "Yunusobod (demo)", address: "Namuna ko'chasi 2" },
];

/**
 * One user per role. The Principal has CHL only, so YUN has no Principal (plan of 0.14,
 * decision 1, Look first); the Manager and Finance have both branches (decision 2).
 */
export const SEED_USERS = [
  {
    username: "seed_head",
    fullName: "Bahrom Namunaev",
    phone: "+998 90 000 98 01",
    role: "HEAD",
    branches: [],
  },
  {
    username: "seed_manager",
    fullName: "Zarina Namunaeva",
    phone: "+998 90 000 98 02",
    role: "MANAGER",
    branches: ["CHL", "YUN"],
  },
  {
    username: "seed_principal",
    fullName: "Otabek Namunaev",
    phone: "+998 90 000 98 03",
    role: "PRINCIPAL",
    branches: ["CHL"],
  },
  {
    username: "seed_finance",
    fullName: "Nigora Namunaeva",
    phone: "+998 90 000 98 04",
    role: "FINANCE",
    branches: ["CHL", "YUN"],
  },
];

/**
 * The four passwords from `env`, or a refusal that names every missing or empty variable and
 * never a value. No fallback value exists (review of the plan, correction 2).
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>} the password per role
 */
export function seedPasswords(env) {
  const missing = Object.values(SEED_PASSWORD_VARIABLES).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Refused: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. ` +
        "Type a password for each seed user in the local .env (.env.example names them). Nothing was written.",
    );
  }
  return Object.fromEntries(
    Object.entries(SEED_PASSWORD_VARIABLES).map(([role, name]) => [role, String(env[name])]),
  );
}

/**
 * Writes what is missing of the seed in one transaction and keeps what is there (plan of 0.14,
 * decision 4): a branch is found by its code, a user by its username, and a found row is never
 * changed. Refuses, writing nothing, a missing password, a found seed user of another role, and a
 * missing seed Principal when CHL already has an active Principal. Takes the first-Head lock, so
 * a seed and `npm run user:first-head` take turns.
 * @param {import("pg").ClientBase} client a connected client, not inside a transaction
 * @param {Record<string, string | undefined>} env where the passwords are read
 * @param {Date} moment the time of the rows, from the caller (CLAUDE.md rule 10)
 * @returns {Promise<string[]>} one line per row, "created …" or "kept …"
 */
export async function seed(client, env, moment) {
  const passwords = seedPasswords(env);
  const query = (text, values) => client.query(text, values);
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock($1, 0)", [FIRST_HEAD_LOCK]);

    const foundUsers = new Map();
    const users = await client.query(
      "select id, username, role from users where username = any($1::text[])",
      [SEED_USERS.map((user) => user.username)],
    );
    for (const row of users.rows) foundUsers.set(row.username, row);
    for (const user of SEED_USERS) {
      const found = foundUsers.get(user.username);
      if (found && found.role !== user.role) {
        throw new Error(
          `Refused: the user ${user.username} exists with the role ${found.role}, not ${user.role}. Nothing was written.`,
        );
      }
    }

    const branchIds = new Map();
    const branches = await client.query(
      "select id, code from branches where code = any($1::text[])",
      [SEED_BRANCHES.map((branch) => branch.code)],
    );
    for (const row of branches.rows) branchIds.set(row.code, row.id);
    const principal = SEED_USERS.find((user) => user.role === "PRINCIPAL");
    if (principal && !foundUsers.has(principal.username)) {
      for (const code of principal.branches) {
        const id = branchIds.get(code);
        if (!id) continue;
        const led = await client.query(
          `select 1 from user_branches
            where branch_id = $1 and user_role = 'PRINCIPAL' and user_is_active`,
          [id],
        );
        if (led.rowCount !== 0) {
          throw new Error(
            `Refused: branch ${code} already has an active Principal; ${principal.username} was not created. Nothing was written.`,
          );
        }
      }
    }

    // The Head first: it is the actor of every audit row of the seed, its own included (plan of
    // 0.9, decision 4), and an audit row needs an actor that exists.
    const userLines = new Map();
    const [headUser, ...otherUsers] = SEED_USERS;
    const head = await keepOrCreateUser(
      query,
      headUser,
      passwords,
      foundUsers,
      branchIds,
      null,
      moment,
    );
    userLines.set(headUser.username, head.line);

    const branchLines = [];
    for (const branch of SEED_BRANCHES) {
      if (branchIds.has(branch.code)) {
        branchLines.push(`kept branch ${branch.code}`);
        continue;
      }
      const created = await client.query(
        `insert into branches (name, code, address, is_active, created_at)
         values ($1, $2, $3, true, $4) returning id`,
        [branch.name, branch.code, branch.address, moment],
      );
      const id = created.rows[0].id;
      branchIds.set(branch.code, id);
      await insertAuditRow(query, {
        actorId: head.id,
        action: "branch.create",
        entity: "branches",
        entityId: id,
        before: null,
        after: { name: branch.name, code: branch.code, address: branch.address, isActive: true },
        at: moment,
      });
      branchLines.push(`created branch ${branch.code}`);
    }

    for (const user of otherUsers) {
      const done = await keepOrCreateUser(
        query,
        user,
        passwords,
        foundUsers,
        branchIds,
        head.id,
        moment,
      );
      userLines.set(user.username, done.line);
    }

    await client.query("commit");
    return [...branchLines, ...SEED_USERS.map((user) => userLines.get(user.username))];
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/**
 * Keeps a found user as it is, or creates it with its branches and its `user.create` audit row.
 * `actorId` null: the user is the actor of its own row (the seed Head).
 */
async function keepOrCreateUser(query, user, passwords, foundUsers, branchIds, actorId, moment) {
  const found = foundUsers.get(user.username);
  if (found) return { id: found.id, line: `kept user ${user.username}` };
  const created = await insertPasswordUser(
    query,
    { fullName: user.fullName, username: user.username, phone: user.phone, role: user.role },
    passwords[user.role],
    moment,
  );
  const ids = user.branches.map((code) => branchIds.get(code));
  for (const branchId of ids) {
    await query(
      `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
       values ($1, $2, $3, true, $4)`,
      [created.id, branchId, user.role, moment],
    );
  }
  // A fixed list of fields, as the first Head's row: the password stays out (plan of 0.9).
  await insertAuditRow(query, {
    actorId: actorId ?? created.id,
    action: "user.create",
    entity: "users",
    entityId: created.id,
    before: null,
    after: {
      fullName: user.fullName,
      username: created.username,
      phone: user.phone,
      role: user.role,
      locale: "uz",
      isActive: true,
      branchIds: ids,
    },
    at: moment,
  });
  return { id: created.id, line: `created user ${user.username}` };
}
