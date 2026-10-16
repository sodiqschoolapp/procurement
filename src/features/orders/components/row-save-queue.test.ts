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

// Bad internet (11-screens-and-ux.md, smooth feel 7; plan of 2.6, decided items 7 and 11; review
// of the plan of 2.6, correction 1). The waits are injected: `tries` waits answer true that many
// times, then false, at once.
function instantWaits(tries = Number.POSITIVE_INFINITY) {
  return () => {
    let left = tries;
    return { next: async () => left-- > 0 };
  };
}

describe("createRowSaveQueue with a lost answer (11 rule 7)", () => {
  it("sends a lost save again with the same version; the save behind it waits, then follows", async () => {
    const states: boolean[] = [];
    const queue = createRowSaveQueue(
      3,
      { onRetrying: (retrying) => states.push(retrying) },
      instantWaits(),
    );
    const sent: string[] = [];
    let lostOnce = 2;
    const one = queue.save(async (version) => {
      sent.push(`qty@${version}`);
      return lostOnce-- > 0 ? { kind: "lost" } : { kind: "saved", version: version + 1 };
    });
    const two = queue.save(async (version) => {
      sent.push(`price@${version}`);
      return { kind: "saved", version: version + 1 };
    });
    expect(await one).toEqual({ kind: "saved", version: 4 });
    expect(await two).toEqual({ kind: "saved", version: 5 });
    expect(sent).toEqual(["qty@3", "qty@3", "qty@3", "price@4"]);
    expect(states).toEqual([true, true, false]);
  });

  it("online with no answer: ends as lost when the waits are used up; the version stays and the next save is sent", async () => {
    const queue = createRowSaveQueue(2, {}, instantWaits(5));
    let tries = 0;
    expect(
      await queue.save(async () => {
        tries += 1;
        return { kind: "lost" };
      }),
    ).toEqual({ kind: "lost" });
    expect(tries).toBe(6);
    expect(queue.state()).toEqual({ busy: false, version: 2 });
    expect(await queue.save(async (version) => ({ kind: "saved", version: version + 1 }))).toEqual({
      kind: "saved",
      version: 3,
    });
  });

  it("a retry answered stale whose first try was saved: the reloaded version is taken and the waiting save is still sent", async () => {
    let reloads = 0;
    const queue = createRowSaveQueue(3, { onStale: () => (reloads += 1) }, instantWaits());
    const sent: string[] = [];
    let first = true;
    // qty 5 sent at v3 was saved (v4) but its answer was lost; the retry at v3 is stale.
    const one = queue.save(
      async (version) => {
        sent.push(`qty@${version}`);
        if (first) {
          first = false;
          return { kind: "lost" };
        }
        return { kind: "stale" };
      },
      async () => 4,
    );
    const two = queue.save(async (version) => {
      sent.push(`price@${version}`);
      return { kind: "saved", version: version + 1 };
    });
    expect(await one).toEqual({ kind: "saved", version: 4 });
    expect(await two).toEqual({ kind: "saved", version: 5 });
    expect(sent).toEqual(["qty@3", "qty@3", "price@4"]);
    expect(reloads).toBe(0);
  });

  it("a retry answered stale whose first try never arrived (someone else saved): the stale path drops what waits", async () => {
    let reloads = 0;
    const queue = createRowSaveQueue(3, { onStale: () => (reloads += 1) }, instantWaits());
    let first = true;
    let checked = 0;
    const one = queue.save(
      async () => {
        if (first) {
          first = false;
          return { kind: "lost" };
        }
        return { kind: "stale" };
      },
      async () => {
        checked += 1;
        return null;
      },
    );
    let ranSecond = false;
    const two = queue.save(async () => {
      ranSecond = true;
      return { kind: "saved", version: 9 };
    });
    expect(await one).toEqual({ kind: "stale" });
    expect(await two).toBe("dropped");
    expect(ranSecond).toBe(false);
    expect(checked).toBe(1);
    expect(reloads).toBe(1);
    expect(queue.state().version).toBe(3);
  });

  it("a stale answer to a first try is not checked: the stale path of 2.5b", async () => {
    let checked = 0;
    const queue = createRowSaveQueue(1, {}, instantWaits());
    const answer = await queue.save(
      async () => ({ kind: "stale" }),
      async () => {
        checked += 1;
        return 2;
      },
    );
    expect(answer).toEqual({ kind: "stale" });
    expect(checked).toBe(0);
  });

  it("a hold waits until the retried save has its answer", async () => {
    let open!: () => void;
    const back = new Promise<void>((resolve) => (open = resolve));
    const queue = createRowSaveQueue(1, {}, () => ({
      next: async () => {
        await back;
        return true;
      },
    }));
    let first = true;
    void queue.save(async (version) => {
      if (first) {
        first = false;
        return { kind: "lost" };
      }
      return { kind: "saved", version: version + 1 };
    });
    let heldAt: number | null = null;
    const held = queue.hold().then((version) => (heldAt = version));
    await Promise.resolve();
    expect(heldAt).toBeNull();
    expect(queue.state().busy).toBe(true);
    open();
    await held;
    expect(heldAt).toBe(2);
  });
});
