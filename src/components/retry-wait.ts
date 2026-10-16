import type { ActionResult } from "@/server/action-result";

// The waits between tries of a save that got no answer (11-screens-and-ux.md, smooth feel 7:
// "A form keeps what was typed when the connection drops and retries. A repeated save never
// creates a duplicate"; plan of 2.6, decided item 11). While the browser is offline, the next try
// waits for its `online` event, checking every 30 s, with no limit: a save that gave up would lose
// what was typed. While the browser says it is online and still no answer comes (a server fault, a
// lost session), five more tries after 2, 4, 8, 16 and 30 s, then it stops, so a fault on the
// server never keeps a form locked for ever. Timer and online state are injected, so the tests
// never wait. Plain TypeScript; no React.

export const ONLINE_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
export const OFFLINE_CHECK_MS = 30_000;

export type RetryEnv = {
  isOnline(): boolean;
  sleep(ms: number): Promise<void>;
  /** Resolves on the browser's `online` event or after `ms`, whichever comes first. */
  untilOnline(ms: number): Promise<void>;
};

export type RetryWaits = {
  /** Waits before the next try: true to try again, false when the tries are used up. */
  next(): Promise<boolean>;
};

export function browserRetryEnv(): RetryEnv {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return {
    isOnline: () => typeof navigator === "undefined" || navigator.onLine,
    sleep,
    untilOnline: (ms) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          window.removeEventListener("online", done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        window.addEventListener("online", done);
      }),
  };
}

export function createRetryWaits(env: RetryEnv = browserRetryEnv()): RetryWaits {
  let onlineTries = 0;
  return {
    async next() {
      if (!env.isOnline()) {
        await env.untilOnline(OFFLINE_CHECK_MS);
        return true;
      }
      const delay = ONLINE_RETRY_DELAYS_MS[onlineTries];
      if (delay === undefined) return false;
      onlineTries += 1;
      await env.sleep(delay);
      return true;
    },
  };
}

/**
 * Calls `attempt` until it gives an answer that is not `network`, or the waits are used up; the
 * last answer is returned. Used by the add row: every try sends the same input with the same
 * client key, so the server answers a repeat with the first result (developer-rules.md rule 8).
 * `undefined` (the action runner ignored a call while another was pending) ends it.
 */
export async function retryWhileLost<Result>(
  attempt: () => Promise<ActionResult<Result> | undefined>,
  waits: RetryWaits,
  onRetrying: (retrying: boolean) => void = () => undefined,
): Promise<ActionResult<Result> | undefined> {
  let answer = await attempt();
  try {
    while (answer && !answer.ok && answer.error.code === "network") {
      onRetrying(true);
      if (!(await waits.next())) break;
      answer = await attempt();
    }
  } finally {
    onRetrying(false);
  }
  return answer;
}
