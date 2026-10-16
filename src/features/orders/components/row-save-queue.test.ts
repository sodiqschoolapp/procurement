import { describe, expect, it } from "vitest";

import { type SaveAnswer, createRowSaveQueue } from "./row-save-queue";

// The save queue of a drafts-grid row (05-order-request-form.md, Drafts 3: autosave;
// developer-rules.md rule 9: a write with an old version is refused; plan of 2.5b, decided
// items 5 and 10; review of the plan, Should fix 4 and 11).

function gate() {
  let open!: (answer: SaveAnswer) => void;
  const answer = new Promise<SaveAnswer>((resolve) => (open = resolve));
  return { answer, open };
}

describe("createRowSaveQueue (05 Drafts 3; developer-rules rule 9)", () => {
  it("runs one save at a time, the next with the version the last answer gave", async () => {
    const queue = createRowSaveQueue(3);
    const sent: number[] = [];
    const first = gate();
    const one = queue.save((version) => {
      sent.push(version);
      return first.answer;
    });
    const two = queue.save(async (version) => {
      sent.push(version);
      return { kind: "saved", version: version + 1 };
    });
    expect(sent).toEqual([3]);
    expect(queue.state().busy).toBe(true);
    first.open({ kind: "saved", version: 4 });
    expect(await one).toEqual({ kind: "saved", version: 4 });
    expect(await two).toEqual({ kind: "saved", version: 5 });
    expect(sent).toEqual([3, 4]);
    expect(queue.state()).toEqual({ busy: false, version: 5 });
  });

  it("a stale answer drops the waiting saves and asks for a reload", async () => {
    let reloads = 0;
    const queue = createRowSaveQueue(1, { onStale: () => (reloads += 1) });
    const first = gate();
    const one = queue.save(() => first.answer);
    let ranSecond = false;
    const two = queue.save(async () => {
      ranSecond = true;
      return { kind: "saved", version: 9 };
    });
    first.open({ kind: "stale" });
    expect(await one).toEqual({ kind: "stale" });
    expect(await two).toBe("dropped");
    expect(ranSecond).toBe(false);
    expect(reloads).toBe(1);
    expect(queue.state()).toEqual({ busy: false, version: 1 });
  });

  it("a refused save keeps the version; a thrown save counts as refused", async () => {
    const queue = createRowSaveQueue(2);
    expect(await queue.save(async () => ({ kind: "refused" }))).toEqual({ kind: "refused" });
    expect(
      await queue.save(async () => {
        throw new Error("network");
      }),
    ).toEqual({ kind: "refused" });
    expect(queue.state().version).toBe(2);
  });

  it("hold waits for the running save, keeps new saves waiting, release gives the new version", async () => {
    const queue = createRowSaveQueue(1);
    const first = gate();
    void queue.save(() => first.answer);
    const held = queue.hold();
    first.open({ kind: "saved", version: 2 });
    expect(await held).toBe(2);
    const sent: number[] = [];
    const after = queue.save(async (version) => {
      sent.push(version);
      return { kind: "saved", version: version + 1 };
    });
    await Promise.resolve();
    expect(sent).toEqual([]);
    queue.release(3);
    expect(await after).toEqual({ kind: "saved", version: 4 });
    expect(sent).toEqual([3]);
  });

  it("adopts a version from the server only while nothing runs or waits", async () => {
    const queue = createRowSaveQueue(1);
    expect(queue.adopt(5)).toBe(true);
    const first = gate();
    void queue.save(() => first.answer);
    expect(queue.adopt(8)).toBe(false);
    first.open({ kind: "saved", version: 6 });
    await queue.hold();
    queue.release();
    expect(queue.state().version).toBe(6);
  });
});
