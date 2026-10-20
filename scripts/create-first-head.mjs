// npm run user:first-head: creates the first Head of an empty database (build-plan 0.6).
// It asks for the full name, the username, the phone and the password twice; the password is
// never shown while typed and never printed. It prints the username only.
import { createInterface } from "node:readline/promises";

import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { askHidden } from "./ask-hidden.mjs";
import { createFirstHead } from "./first-head.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").');
  process.exit(1);
}

const lines = createInterface({ input: process.stdin, output: process.stdout });
const fullName = await lines.question("Full name: ");
const username = await lines.question("Username: ");
const phone = await lines.question("Phone: ");
lines.close();
const password = await askHidden("Password: ");
const again = await askHidden("Password again: ");
if (password !== again) {
  console.error("The two passwords differ. Nothing was created.");
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
  const created = await createFirstHead(client, { fullName, username, phone, password }, moment);
  console.log(`Created the Head "${created.username}". Sign in at /login.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
