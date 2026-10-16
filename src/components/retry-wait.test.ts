import { describe, expect, it } from "vitest";

import { type ActionResult, failure } from "@/server/action-result";

import {
  OFFLINE_CHECK_MS,
  ONLINE_RETRY_DELAYS_MS,
  type RetryEnv,
  createRetryWaits,
  retryWhileLost,
} from "./retry-wait";

// 11-screens-and-ux.md, smooth feel 7 ("keeps what was typed when the connection drops and
// retries. A repeated save never creates a duplicate"); developer-rules.md rule 8; plan of 2.6,
// decided items 9 and 11. The environment is invented: no test waits on a timer.

function fakeEnv(online: boolean[]) {
  const waited: string[] = [];
  let at = 0;
  const env: RetryEnv = {
    isOnline: () => online[Math.min(at++, online.length - 1)]!,
    sleep: async (ms) => void waited.push(`sleep ${ms}`),
    untilOnline: async (ms) => void waited.push(`untilOnline ${ms}`),
  };
  return { env, waited };
}

describe("createRetryWaits (11 rule 7; decided item 11)", () => {
  it("online: five tries after 2, 4, 8, 16 and 30 s, then it stops", async () => {
    const { env, waited } = fakeEnv([true]);
    const waits = createRetryWaits(env);
    const answers: boolean[] = [];
    for (let i = 0; i < 6; i += 1) answers.push(await waits.next());
    expect(answers).toEqual([true, true, true, true, true, false]);
    expect(waited).toEqual(ONLINE_RETRY_DELAYS_MS.map((ms) => `sleep ${ms}`));
  });

  it("offline: waits for the online event (or the 30 s check) with no limit", async () => {
    const { env, waited } = fakeEnv(Array.from({ length: 20 }, () => false));
    const waits = createRetryWaits(env);
    for (let i = 0; i < 20; i += 1) expect(await waits.next()).toBe(true);
    expect(waited).toEqual(Array.from({ length: 20 }, () => `untilOnline ${OFFLINE_CHECK_MS}`));
  });

  it("offline waits do not use up the online tries", async () => {
    const { env } = fakeEnv([false, false, false, true]);
    const waits = createRetryWaits(env);
    const answers: boolean[] = [];
    for (let i = 0; i < 9; i += 1) answers.push(await waits.next());
    expect(answers).toEqual([true, true, true, true, true, true, true, true, false]);
  });
});

describe("retryWhileLost (developer-rules rule 8; decided item 9)", () => {
  const created: ActionResult<{ id: string }> = { ok: true, data: { id: "draft-1" } };

  it("sends the same input until an answer comes, and reports the retrying state", async () => {
    const { env } = fakeEnv([false, false, true]);
    const sent: object[] = [];
    const input = { clientKey: "k-1", quantity: "10" };
    const answers: ActionResult<{ id: string }>[] = [
      failure("network"),
      failure("network"),
      created,
    ];
    const states: boolean[] = [];
    const answer = await retryWhileLost(
      async () => {
        sent.push(input);
        return answers.shift()!;
      },
      createRetryWaits(env),
      (retrying) => states.push(retrying),
    );
    expect(answer).toEqual(created);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((one) => JSON.stringify(one)))).toEqual(
      new Set([JSON.stringify(input)]),
    );
    expect(states.at(-1)).toBe(false);
    expect(states).toContain(true);
  });

  it("a refusal is an answer: it is returned at once and never sent again", async () => {
    const { env } = fakeEnv([true]);
    let tries = 0;
    const answer = await retryWhileLost(async () => {
      tries += 1;
      return failure("invalid_input");
    }, createRetryWaits(env));
    expect(tries).toBe(1);
    expect(answer).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("online with no answer: stops after the five waits with the network answer", async () => {
    const { env } = fakeEnv([true]);
    let tries = 0;
    const answer = await retryWhileLost(async () => {
      tries += 1;
      return failure("network");
    }, createRetryWaits(env));
    expect(tries).toBe(1 + ONLINE_RETRY_DELAYS_MS.length);
    expect(answer).toMatchObject({ ok: false, error: { code: "network" } });
  });
});
