// npm run db:counts: the counts of the restore drill (build-plan 9.6; docs/restore.md), run in the
// console of the app's component `web`. Reads only.
//
//   npm run db:counts                        the app's own database
//   npm run db:counts -- --database <name>   another database of the same cluster (a restored copy)
//   npm run db:counts -- --ask [--own-ca]    a database whose address is typed at a hidden prompt
//                                            (the drill cluster); --own-ca also asks for its CA
//   ... --until <moment>                     only the rows created up to that moment (ISO 8601)
//
// The address is never an argument and never printed: the line names host, port and database only.
import { createInterface } from "node:readline/promises";

import { describeDatabase, failureReason } from "./apply-migrations.mjs";
import { askHidden } from "./ask-hidden.mjs";
import { countTarget, countsLine, readCounts } from "./restore-counts.mjs";

/** The arguments, or a message saying what is wrong with them. */
function parse(args) {
  const result = { database: undefined, ask: false, ownCa: false, until: null };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--ask") result.ask = true;
    else if (name === "--own-ca") result.ownCa = true;
    else if (name === "--database") result.database = args[(index += 1)] ?? "";
    else if (name === "--until") {
      const text = args[(index += 1)] ?? "";
      const moment = new Date(text);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(moment.getTime())) {
        throw new Error(
          `Refused: --until "${text}" is not a moment such as 2026-10-19T23:00:00.000Z.`,
        );
      }
      result.until = moment;
    } else throw new Error(`Refused: unknown argument "${name}". See docs/restore.md.`);
  }
  if (result.ask && result.database !== undefined) {
    throw new Error("Refused: give --ask or --database, not both.");
  }
  return result;
}

/** A pasted certificate: the lines up to the one that ends it. */
async function askCertificate() {
  console.log("Paste the CA certificate of that cluster (it is public), then press Enter:");
  const lines = createInterface({ input: process.stdin });
  const pasted = [];
  for await (const line of lines) {
    pasted.push(line);
    if (line.includes("-----END CERTIFICATE-----")) break;
  }
  lines.close();
  return pasted.join("\n");
}

try {
  const options = parse(process.argv.slice(2));
  let target = { database: options.database };
  let where;
  if (options.ask) {
    const address = (await askHidden("Address of the database to count (not shown): ")).trim();
    const ca = options.ownCa ? await askCertificate() : undefined;
    target = { address, ca };
    where = describeDatabase(address);
  } else {
    const connectionString = countTarget(process.env, target).connectionString;
    where = describeDatabase(connectionString);
  }
  const counts = await readCounts(countTarget(process.env, target), options.until);
  const until = options.until ? ` up to ${options.until.toISOString()}` : "";
  console.log(`Counts of ${where}${until}:`);
  console.log(countsLine(counts));
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Refused:")) {
    console.error(error.message);
  } else {
    const reason = failureReason(error);
    console.error(`counts failed: ${reason}`);
    if (/certificate/i.test(reason)) {
      console.error("The server's certificate was refused: run it again with --ask --own-ca.");
    }
  }
  process.exitCode = 1;
}
