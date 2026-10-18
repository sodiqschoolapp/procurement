import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";

// Two real actions at the same moment, started in a fixed order while a third transaction holds
// the row the first waits on (.claude/rules/tests.md); the waits are read from pg_stat_activity,
// never timed. From the issue's same-moment tests of 5.4, shared with the return's of 5.6.

/**
 * Holds `lock` in a transaction of its own; starts each action only once every earlier one waits
 * on a lock, then commits the hold and returns every outcome in order.
 */
export async function heldWhile(
  lock: string,
  values: unknown[],
  actions: ReadonlyArray<() => Promise<ActionResult<unknown>>>,
): Promise<ActionResult<unknown>[]> {
  const client = await db.$client.connect();
  const waiting = async (count: number) => {
    for (let tries = 0; ; tries += 1) {
      await client.query("select pg_stat_clear_snapshot()");
      const found = await client.query<{ n: number }>(
        `select count(*)::int as n from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
      );
      if (found.rows[0]!.n >= count) return;
      if (tries > 5_000) throw new Error(`heldWhile: only ${found.rows[0]!.n} of ${count} waited.`);
    }
  };
  try {
    await client.query("begin");
    await client.query(lock, values);
    const running: Promise<ActionResult<unknown>>[] = [];
    for (const [at, action] of actions.entries()) {
      const started = action();
      started.catch(() => undefined);
      running.push(started);
      await waiting(at + 1);
    }
    await client.query("commit");
    return await Promise.all(running);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
