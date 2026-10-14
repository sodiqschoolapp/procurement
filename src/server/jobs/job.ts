import type { Schedule } from "@/domain/schedule";
import type { db as Database } from "@/server/db/client";

// What a scheduled job is (build-plan 0.13). A job runs as the system: no signed-in user, no
// authorize(), no runAction (plan of 0.13, decision 1, Look first). It reads and writes through
// `tx`, a savepoint inside the transaction that holds its lock, so nothing of a run that throws is
// saved (developer-rules.md rule 3; review of the plan, correction 1). What it tells a person goes
// through notify() with `userId: null`, which keeps the branch wall per recipient.

type Transaction = Parameters<Parameters<typeof Database.transaction>[0]>[0];

export type JobContext = {
  tx: Transaction;
  /** The tick this run is for (src/domain/schedule.ts). The current moment is `now()`. */
  tick: Date;
};

export type Job = {
  /** The key of its row in `scheduled_jobs`: lower-case letters, digits and `_`. */
  name: string;
  schedule: Schedule;
  run(context: JobContext): Promise<void>;
};
