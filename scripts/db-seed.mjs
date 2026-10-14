// npm run db:seed: the invented demo data (build-plan 0.14) on the database of DATABASE_URL.
// The passwords come from the local .env (.env.example names them); none is ever printed.
// It prints one line per branch and user, "created" or "kept", then "seed done". A database
// not on this machine is refused unless SEED_DEMO_DATA is yes (the test copy, build-plan 0.15).
import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { seed, seedPasswords, seedTargetAllowed } from "./seed.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").');
  process.exit(1);
}
// Before any connection: a hosted database without the test copy's switch is refused (build-plan
// 0.15, plan decision 3).
const target = seedTargetAllowed(connectionString, process.env);
if (!target.allowed) {
  console.error(target.reason);
  process.exit(1);
}
try {
  seedPasswords(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
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
  for (const line of await seed(client, process.env, moment)) console.log(line);
  console.log("seed done");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
