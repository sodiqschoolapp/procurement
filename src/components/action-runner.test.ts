import { describe, expect, it, vi } from "vitest";

import { failure } from "@/server/action-result";

import { TRIES_WITH_CLIENT_KEY, callWithRetry, createActionRunner } from "./action-runner";
import { newClientKey } from "./client-key";

// The client helper of the action wrapper (plan of 0.8): 11-screens-and-ux.md smooth feel 7
// ("Bad internet … retries. A repeated save never creates a duplicate") and
// edge-cases/requests-and-approval.md "Submit is clicked twice".

const lost = () => Promise.reject(new TypeError("Failed to fetch"));

describe("callWithRetry (smooth feel 7)", () => {
  it("tries a create with a client key again with the same input, three tries in all, then network", async () => {
    const input = { clientKey: newClientKey(), title: "Sinov" };
    const action = vi.fn(lost);

    expect(await callWithRetry(action, input)).toEqual(failure("network"));
    expect(action).toHaveBeenCalledTimes(TRIES_WITH_CLIENT_KEY);
    expect(TRIES_WITH_CLIENT_KEY).toBe(3);
    for (const call of action.mock.calls) expect(call).toEqual([input]);
  });

  it("returns the answer of a later try", async () => {
    const input = { clientKey: newClientKey() };
    const action = vi
      .fn()
      .mockImplementationOnce(lost)
      .mockResolvedValueOnce({ ok: true, data: { id: "first" } });

    expect(await callWithRetry(action, input)).toEqual({ ok: true, data: { id: "first" } });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("an answer that is not an ActionResult counts as lost", async () => {
    const action = vi.fn().mockResolvedValue("<html>");
    expect(await callWithRetry(action, { clientKey: newClientKey() })).toEqual(failure("network"));
    expect(action).toHaveBeenCalledTimes(3);
  });

  it("never tries a move without a client key again (plan of 0.8, decision 8)", async () => {
    const action = vi.fn(lost);
    expect(await callWithRetry(action, { id: "invented", version: 3 })).toEqual(failure("network"));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("an input whose key is not a client key is not tried again", async () => {
    const action = vi.fn(lost);
    await callWithRetry(action, { clientKey: "not-a-key" });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("never tries a refusal again", async () => {
    const action = vi.fn().mockResolvedValue(failure("stale_version"));
    expect(await callWithRetry(action, { clientKey: newClientKey() })).toEqual(
      failure("stale_version"),
    );
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("createActionRunner (Submit is clicked twice)", () => {
  it("ignores a second run while the first is pending, and calls the action once", async () => {
    let answer!: (value: unknown) => void;
    const action = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const changes: boolean[] = [];
    const runner = createActionRunner(action as never, (pending) => changes.push(pending));

    const first = runner.run({ id: "invented" });
    expect(runner.pending).toBe(true);
    expect(await runner.run({ id: "invented" })).toBeUndefined();
    answer({ ok: true, data: 1 });

    expect(await first).toEqual({ ok: true, data: 1 });
    expect(action).toHaveBeenCalledTimes(1);
    expect(runner.pending).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it("lets the next call through once the first has answered", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: 1 });
    const runner = createActionRunner(action);
    await runner.run({});
    await runner.run({});
    expect(action).toHaveBeenCalledTimes(2);
  });
});
