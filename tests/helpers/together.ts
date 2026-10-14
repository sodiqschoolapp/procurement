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
