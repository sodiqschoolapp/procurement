import { describe, expect, it } from "vitest";

import { runTogether } from "./together";

// 15-quality-and-acceptance.md, Test layers: "Actions run two at a time to prove the locks work".
describe("runTogether (15-quality-and-acceptance.md, Test layers)", () => {
  it("lets nobody past meet() before every action has arrived", async () => {
    const log: string[] = [];

    await runTogether([
      async (meet) => {
        log.push("a arrives");
        await meet();
        log.push("a goes on");
      },
      async (meet) => {
        await Promise.resolve();
        await Promise.resolve();
        log.push("b arrives");
        await meet();
        log.push("b goes on");
      },
    ]);

    expect(log.slice(0, 2)).toEqual(["a arrives", "b arrives"]);
    expect(log.slice(2).sort()).toEqual(["a goes on", "b goes on"]);
  });

  it("returns each outcome in order, a refusal included, instead of throwing", async () => {
    const results = await runTogether<string>([
      async () => "first",
      async () => {
        throw new Error("refused");
      },
    ]);

    expect(results[0]).toEqual({ status: "fulfilled", value: "first" });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { message: "refused" } });
  });

  it("fails the waiting action with a clear message when another never meets", async () => {
    const results = await runTogether([async (meet) => meet(), async () => undefined], {
      waitMs: 20,
    });

    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: { message: "runTogether: only 1 of 2 actions called meet() within 20 ms." },
    });
    expect(results[1]).toEqual({ status: "fulfilled", value: undefined });
  });
});
