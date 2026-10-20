// npm run user:renew-head: renews the password of one active Head, run in the hosting console
// (03-roles-and-permissions.md rule 4; A8; build-plan 8.2b). It asks for the username and the
// password twice; the password is never shown while typed and never printed. It ends every
// session of that Head and writes an audit row. Nothing in the app changes (D9).
import { createInterface } from "node:readline/promises";

import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { askHidden } from "./ask-hidden.mjs";
import { renewHeadPassword } from "./head-password.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").');
  process.exit(1);
}

const lines = createInterface({ input: process.stdin, output: process.stdout });
const username = await lines.question("Username of the Head: ");
lines.close();
const password = await askHidden("New password: ");
const again = await askHidden("New password again: ");
if (password !== again) {
  console.error("The two passwords differ. Nothing was changed.");
  process.exit(1);
}

const client = new pg.Client({
  ...connectionOptions(connectionString, process.env.DATABASE_CA_CERT),
  options: "-c timezone=UTC",
});
await client.connect();
try {
  // A plain .mjs script cannot load the TypeScript clock of src/server/clock.ts (decisions 0.2:
  // no tsx), so the moment is read here once; CLAUDE.md rule 10 is kept by passing it in.
  // eslint-disable-next-line no-restricted-syntax -- the one moment of this script (rule 10)
  const moment = new Date();
  const renewed = await renewHeadPassword(client, { username, password }, moment);
  console.log(
    `Renewed the password of "${renewed.username}". Every session of this Head is ended.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
