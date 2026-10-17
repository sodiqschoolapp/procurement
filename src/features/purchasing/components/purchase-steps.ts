// The steps of the purchase form at phone width (11-screens-and-ux.md, smooth feel 3: "one order
// or group row at a time"; plan of 3.9 and its review, corrections 3). A step is one block of the
// form: one order, or one group row with its orders. The visit (date, payment, supplier, receipt)
// and the trip-wide alert are on the last step. After a refused save the form opens the first
// step that holds an error, so no error is left on a hidden step (smooth feel 4). The server names
// a line by its place in what was sent (`lines.<n>.<field>`); a line of quantity 0 is not sent, so
// the place maps back through `sent` to its order. Plain decisions, tested without a browser.

/** The step to show after a refused save: the first with an error, or `current` with none. */
export function firstStepWithError(
  errorKeys: readonly string[],
  sent: readonly string[],
  steps: readonly (readonly string[])[],
  current: number,
): number {
  const last = steps.length - 1;
  let first: number | null = null;
  for (const key of errorKeys) {
    const line = /^lines\.(\d+)(\.|$)/.exec(key);
    let step = last;
    if (line) {
      const orderId = sent[Number(line[1])];
      const found = steps.findIndex((ids) => orderId !== undefined && ids.includes(orderId));
      if (found >= 0) step = found;
    }
    if (first === null || step < first) first = step;
  }
  return first ?? current;
}
