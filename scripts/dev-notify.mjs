// npm run dev:notify: gives the first active Head one notification, for the by-hand check of
// build-plan 0.11 ("a development-only script gives the first Head one notification; the bell
// shows 1, opening it follows the link and the count falls to 0"). Development only: it refuses
// in production and on any database but the local one of README.md (plan of 0.11, decision 11).
// The notification is BRANCH_ROLE_VACANT with an invented branch code; its link is Home. It is
// written by the same statement as notify() (src/server/notification-row.mjs). Each run adds
// one more: the bell shows 1 on the first run.
import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { insertNotifications } from "../src/server/notification-row.mjs";

/** The local database of README.md, "Run it": this host and port only. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "5433";

/**
 * Why the script must not run here, or `null` when it may.
 * @param {{ NODE_ENV?: string, DATABASE_URL?: string }} env
 * @returns {string | null}
 */
export function refusalOf(env) {
  if (env.NODE_ENV === "production") return "Refused: this script is for development only.";
  if (!env.DATABASE_URL)
    return 'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").';
  let address;
  try {
    address = new URL(env.DATABASE_URL);
  } catch {
    return "Refused: DATABASE_URL is not an address.";
  }
  if (!LOCAL_HOSTS.has(address.hostname) || address.port !== LOCAL_PORT) {
    return "Refused: this script writes only to the local database of README.md.";
  }
  return null;
}

/**
 * Writes the notification for the first active Head in one transaction and returns the Head's
 * username, or `null` when no active Head exists. The moment is the database's `now()` (review of
 * the plan of 0.11, correction 2: never `new Date()` in a script).
 * @param {pg.Client} client
 * @returns {Promise<string | null>}
 */
export async function notifyFirstHead(client) {
  await client.query("begin");
  try {
    const found = await client.query(
      `select id, username, now() as at from users
       where role = 'HEAD' and is_active
       order by created_at, id limit 1`,
    );
    const head = found.rows[0];
    if (!head) {
      await client.query("rollback");
      return null;
    }
    await insertNotifications((text, values) => client.query(text, values), {
      userIds: [head.id],
      actorId: null,
      type: "BRANCH_ROLE_VACANT",
      params: { branch: "DEMO", role: "PRINCIPAL" },
      link: "/",
      at: head.at,
    });
    await client.query("commit");
    return head.username;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const refusal = refusalOf(process.env);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  const client = new pg.Client({
    ...connectionOptions(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
    options: "-c timezone=UTC",
  });
  await client.connect();
  try {
    const username = await notifyFirstHead(client);
    if (username === null) {
      console.error("Refused: no active Head. Create one first: npm run user:first-head.");
      process.exitCode = 1;
    } else {
      console.log(`Gave the Head "${username}" one notification. Sign in and look at the bell.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
