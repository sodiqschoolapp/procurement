// The save queue of one row of the drafts grid (05-order-request-form.md, Drafts 3: "A draft
// saves itself after each change"; developer-rules.md rule 9: a write with an old version is
// refused; plan of 2.5b, decided item 5). One save at a time per row: the next one is sent with
// the version the last answer gave. A `stale` answer drops what is still waiting and asks for the
// row to be reloaded from the server (decided item 10): the newest saved row wins. "Apply to
// ticked" holds the queues of its rows, so its own versions and a row's save never refuse each
// other (review of the plan, Should fix 4). Plain TypeScript, so it is tested without React.
//
// Bad internet (11-screens-and-ux.md, smooth feel 7; plan of 2.6, decided items 7 and 11): a job
// that answers `lost` (no answer came) stays first and is sent again with the same version after
// the waits of retry-wait.ts; the saves behind it wait. When the waits are used up, it ends as
// `lost` and the row keeps what was typed. A retry answered `stale` may mean the first try was
// saved and only its answer lost: the job's `landed` check reads the row again and, when the
// server row holds what the job sent, gives its version; the answer then counts as saved and the
// saves waiting behind it go on with that version. Otherwise it is the stale path above (review of
// the plan of 2.6, correction 1).

import { type RetryWaits, createRetryWaits } from "@/components/retry-wait";

export type SaveAnswer =
  { kind: "saved"; version: number } | { kind: "refused" } | { kind: "stale" } | { kind: "lost" };

export type SaveJob = (version: number) => Promise<SaveAnswer>;

/**
 * After a retried job answered stale: the server's version when its row holds what was sent and
 * that version is the one the job's own write made (`sentVersion + 1`); else null. A newer version
 * means another write came after it, and the saves waiting behind must not skip its check
 * (developer-rules.md rule 9; permission review of 2.6, Must fix 1).
 */
export type LandedCheck = (sentVersion: number) => Promise<number | null>;

export type QueueState = { busy: boolean; version: number };

export type RowSaveQueue = {
  /** Runs a save after the ones before it, with the version current when it starts. */
  save(job: SaveJob, landed?: LandedCheck): Promise<SaveAnswer | "dropped">;
  /** Waits until nothing is running and keeps new saves waiting until release(); the version. */
  hold(): Promise<number>;
  /** Ends a hold, with the new version when the held write saved. */
  release(version?: number): void;
  /** The version of a row the server sent again, taken only while nothing runs or waits. */
  adopt(version: number): boolean;
  state(): QueueState;
  /** Sets who hears of a change of state and of a stale answer. */
  listen(events: QueueEvents): void;
};

export type QueueEvents = {
  onChange?: (state: QueueState) => void;
  onStale?: () => void;
  /** True while a job that got no answer waits to be sent again. */
  onRetrying?: (retrying: boolean) => void;
};

export function createRowSaveQueue(
  initialVersion: number,
  initialEvents: QueueEvents = {},
  retryWaits: () => RetryWaits = () => createRetryWaits(),
): RowSaveQueue {
  let events = initialEvents;
  let version = initialVersion;
  let running = false;
  let held = false;
  let generation = 0;
  const waiting: {
    job: SaveJob;
    landed?: LandedCheck;
    done: (answer: SaveAnswer | "dropped") => void;
  }[] = [];
  const idleWaiters: (() => void)[] = [];

  const busy = () => running || held || waiting.length > 0;
  const changed = () => events.onChange?.({ busy: busy(), version });

  async function pump(): Promise<void> {
    if (running || held) return;
    const next = waiting.shift();
    if (!next) {
      for (const wake of idleWaiters.splice(0)) wake();
      changed();
      return;
    }
    running = true;
    changed();
    const started = generation;
    const sentVersion = version;
    const send = async (): Promise<SaveAnswer> => {
      try {
        return await next.job(version);
      } catch {
        return { kind: "refused" };
      }
    };
    let answer = await send();
    let retried = false;
    if (answer.kind === "lost") {
      const waits = retryWaits();
      try {
        while (answer.kind === "lost") {
          events.onRetrying?.(true);
          if (!(await waits.next())) break;
          retried = true;
          answer = await send();
        }
      } finally {
        events.onRetrying?.(false);
      }
    }
    if (answer.kind === "stale" && retried && next.landed) {
      let landedVersion: number | null = null;
      try {
        landedVersion = await next.landed(sentVersion);
      } catch {
        landedVersion = null;
      }
      if (landedVersion === sentVersion + 1) answer = { kind: "saved", version: landedVersion };
    }
    running = false;
    if (started === generation) {
      if (answer.kind === "saved") version = answer.version;
      if (answer.kind === "stale") {
        generation += 1;
        for (const dropped of waiting.splice(0)) dropped.done("dropped");
        events.onStale?.();
      }
    }
    next.done(answer);
    void pump();
  }

  return {
    save(job, landed) {
      return new Promise((done) => {
        waiting.push({ job, landed, done });
        changed();
        void pump();
      });
    },
    hold() {
      return new Promise((resolve) => {
        const take = () => {
          held = true;
          changed();
          resolve(version);
        };
        if (!running && !held && waiting.length === 0) take();
        else idleWaiters.push(take);
      });
    },
    release(newVersion) {
      if (newVersion !== undefined) version = newVersion;
      held = false;
      changed();
      void pump();
    },
    adopt(newVersion) {
      if (busy()) return false;
      version = newVersion;
      changed();
      return true;
    },
    state: () => ({ busy: busy(), version }),
    listen(next) {
      events = next;
    },
  };
}
