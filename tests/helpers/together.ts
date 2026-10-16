// Running actions at the same moment (15-quality-and-acceptance.md, Test layers: "Actions run
// two at a time to prove the locks work"). Every function starts in the same tick. Each gets a
// meet() that resolves only when all of them have called it, so a test can bring two
// transactions to the same point before either writes. Call meet() before taking a lock the
// other one needs, never after, or the two wait for each other for ever.

export type Meet = () => Promise<void>;

/** Starts every function at once and returns each one's outcome, in the same order. */
export async function runTogether<T>(
  actions: ReadonlyArray<(meet: Meet) => Promise<T>>,
  options: { waitMs?: number } = {},
): Promise<PromiseSettledResult<T>[]> {
  const waitMs = options.waitMs ?? 5_000;
  let arrived = 0;
  let open!: () => void;
  let giveUp!: (error: Error) => void;
  const allThere = new Promise<void>((resolve, reject) => {
    open = resolve;
    giveUp = reject;
  });
  // A rejection nobody waits for yet must not end the run.
  allThere.catch(() => undefined);

  const timer = setTimeout(() => {
    giveUp(
      new Error(
        `runTogether: only ${arrived} of ${actions.length} actions called meet() within ${waitMs} ms.`,
      ),
    );
  }, waitMs);

  const meet: Meet = () => {
    arrived += 1;
    if (arrived === actions.length) open();
    return allThere;
  };

  try {
    return await Promise.allSettled(actions.map((action) => action(meet)));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Holds a change uncommitted while `action` runs, until the action waits on a row lock of the
 * change, then commits it: so the action meets the change exactly in the middle of its own
 * transaction (15 Test layers: "prove the locks work"). `change` runs on its own connection
 * inside BEGIN; the wait is read from pg_stat_activity, never timed. The action's outcome is
 * returned.
 */
export async function commitWhileWaiting<T>(
  change: (query: (text: string, values?: unknown[]) => Promise<unknown>) => Promise<void>,
  action: () => Promise<T>,
): Promise<T> {
  const { db } = await import("@/server/db/client");
  const client = await db.$client.connect();
  try {
    await client.query("begin");
    await change((text, values) => client.query(text, values));
    const running = action();
    // A rejection is read below; it must not end the run while the loop polls.
    running.catch(() => undefined);
    for (let tries = 0; ; tries += 1) {
      // Statistics are a snapshot per transaction: cleared, each read sees the action anew.
      await client.query("select pg_stat_clear_snapshot()");
      const waiting = await client.query<{ n: number }>(
        `select count(*)::int as n from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
      );
      if (waiting.rows[0]!.n > 0) break;
      if (tries > 5_000) throw new Error("commitWhileWaiting: the action never waited on a lock.");
    }
    await client.query("commit");
    return await running;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
