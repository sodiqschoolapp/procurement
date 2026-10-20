// npm run db:restore -- <new database> [<copy key>]: restores the newest weekly copy, or the one
// named, from the bucket of the copies into a new database of the same cluster, then prints its
// counts (build-plan 9.6; docs/restore.md). Never into the app's own database.
import { restoreCopy } from "./restore-copy.mjs";
import { countsLine } from "./restore-counts.mjs";

const [name, key, ...rest] = process.argv.slice(2);
if (!name || rest.length > 0) {
  console.error("Usage: npm run db:restore -- <new database> [<copy key>]. See docs/restore.md.");
  process.exit(1);
}

const result = await restoreCopy(process.env, name, key);
console.log(result.line);
if (result.ok) {
  console.log(`Counts of database "${name}":`);
  console.log(countsLine(result.counts));
} else process.exitCode = 1;
