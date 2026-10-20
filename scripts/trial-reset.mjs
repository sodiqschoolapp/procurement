// npm run trial:reset: ends the trial of the live app (build-plan 9.4; D52), run in the hosting
// console after SEED_DEMO_DATA is removed (docs/deploy.md, "The end of the trial"). It names the
// database, asks for its name as the confirmation, then empties it, applies the migrations from
// zero and records the end of the trial. Once that record exists it refuses, writing nothing.
import { createInterface } from "node:readline/promises";

import { describeDatabase, failureReason } from "./apply-migrations.mjs";
import { endTrial } from "./trial-end.mjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").');
  process.exit(1);
}

console.log(`This deletes every row of the ${describeDatabase(connectionString)}.`);
const lines = createInterface({ input: process.stdin, output: process.stdout });
const typed = await lines.question("Type the database's name to delete everything in it: ");
lines.close();

try {
  // A plain .mjs script cannot load the TypeScript clock of src/server/clock.ts (decisions 0.2:
  // no tsx), so the moment is read here once; CLAUDE.md rule 10 is kept by passing it in.
  // eslint-disable-next-line no-restricted-syntax -- the one moment of this script (rule 10)
  const moment = new Date();
  const ended = await endTrial(connectionString, typed, moment);
  console.log(
    `Trial ended: database "${ended.database}" is empty and migrated (${ended.migrations} migrations). ` +
      "Create the first Head with npm run user:first-head.",
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Refused:")
      ? error.message
      : `trial:reset failed: ${failureReason(error)}`,
  );
  process.exitCode = 1;
}
