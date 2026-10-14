// The core of `npm run user:first-head` (build-plan 0.6: "a script that creates the first Head
// with a password typed at the prompt"). The command line is scripts/create-first-head.mjs.
import { insertPasswordUser } from "../src/server/auth/password-user.mjs";

// The first key of the advisory lock that makes two runs at once take turns.
const FIRST_HEAD_LOCK = 61;

/**
 * Creates the first Head in one transaction, or refuses when any HEAD user exists, active or
 * not (plan of 0.6, decision 17). No audit row yet: `audit_log` arrives with task 0.9.
 * @param {import("pg").ClientBase} client a connected client, not inside a transaction
 * @param {{ fullName: string, username: string, phone: string, password: string }} input
 * @param {Date} moment
 * @returns {Promise<{ id: string, username: string }>}
 */
export async function createFirstHead(client, input, moment) {
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock($1, 0)", [FIRST_HEAD_LOCK]);
    const heads = await client.query("select 1 from users where role = 'HEAD' limit 1");
    if (heads.rowCount !== 0) {
      throw new Error("Refused: a Head exists already. The Head creates every other account.");
    }
    if (!input.fullName.trim() || !input.phone.trim()) {
      throw new Error("Refused: the full name and the phone must not be empty.");
    }
    const created = await insertPasswordUser(
      (text, values) => client.query(text, values),
      { ...input, role: "HEAD" },
      input.password,
      moment,
    );
    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
