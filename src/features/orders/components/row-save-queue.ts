// The save queue of one row of the drafts grid (05-order-request-form.md, Drafts 3: "A draft
// saves itself after each change"; developer-rules.md rule 9: a write with an old version is
// refused; plan of 2.5b, decided item 5). One save at a time per row: the next one is sent with
// the version the last answer gave. A `stale` answer drops what is still waiting and asks for the
// row to be reloaded from the server (decided item 10): the newest saved row wins. "Apply to
// ticked" holds the queues of its rows, so its own versions and a row's save never refuse each
// other (review of the plan, Should fix 4). Plain TypeScript, so it is tested without React.

export type SaveAnswer =
  { kind: "saved"; version: number } | { kind: "refused" } | { kind: "stale" };

export type SaveJob = (version: number) => Promise<SaveAnswer>;

export type QueueState = { busy: boolean; version: number };

export type RowSaveQueue = {
  /** Runs a save after the ones before it, with the version current when it starts. */
  save(job: SaveJob): Promise<SaveAnswer | "dropped">;
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

export type QueueEvents = { onChange?: (state: QueueState) => void; onStale?: () => void };

export function createRowSaveQueue(
  initialVersion: number,
  initialEvents: QueueEvents = {},
): RowSaveQueue {
  let events = initialEvents;
  let version = initialVersion;
  let running = false;
  let held = false;
  let generation = 0;
  const waiting: { job: SaveJob; done: (answer: SaveAnswer | "dropped") => void }[] = [];
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
    let answer: SaveAnswer;
    try {
      answer = await next.job(version);
    } catch {
      answer = { kind: "refused" };
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
    save(job) {
      return new Promise((done) => {
        waiting.push({ job, done });
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
