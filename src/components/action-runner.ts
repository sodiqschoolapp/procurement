import { type ActionResult, failure, isActionResult } from "@/server/action-result";

import { isClientKey } from "./client-key";

// The plain core of useAction() (plan of 0.8): no React, so it is tested on its own.
// - "Submit is clicked twice: One submit only. The button disables and the server ignores the
//   repeat" (edge-cases/requests-and-approval.md): run() does nothing while a call is pending.
// - "Bad internet. A form keeps what was typed when the connection drops and retries. A repeated
//   save never creates a duplicate" (11-screens-and-ux.md, smooth feel 7): a call that got no
//   answer is tried again with the same input, only when the input carries a client key, which
//   makes the repeat return the first result (developer-rules.md rule 8). A move without a key
//   (submit, approve) is never tried again: a lost answer to a move that did commit would come
//   back as the user's own stale version (plan of 0.8, decision 8).

export type ActionCall<Input, Result> = (input: Input) => Promise<ActionResult<Result>>;

/** Three tries in all for an input with a client key; one for any other. */
export const TRIES_WITH_CLIENT_KEY = 3;

function carriesClientKey(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "clientKey" in input &&
    isClientKey(input.clientKey)
  );
}

/**
 * Calls the action. A refusal (an ActionResult with `ok: false`) is returned at once and never
 * tried again; a call that threw or answered with something else is a lost answer.
 */
export async function callWithRetry<Input, Result>(
  action: ActionCall<Input, Result>,
  input: Input,
): Promise<ActionResult<Result>> {
  const tries = carriesClientKey(input) ? TRIES_WITH_CLIENT_KEY : 1;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const answer: unknown = await action(input);
      if (isActionResult(answer)) return answer as ActionResult<Result>;
    } catch {
      // No answer came back; the next try, if any, sends the same input and key.
    }
  }
  return failure("network");
}

export type ActionRunner<Input, Result> = {
  /** `undefined` when a call was already pending and this one was ignored. */
  run(input: Input): Promise<ActionResult<Result> | undefined>;
  readonly pending: boolean;
};

/** One runner per form: it lets one call through at a time. */
export function createActionRunner<Input, Result>(
  action: ActionCall<Input, Result>,
  onPendingChange: (pending: boolean) => void = () => undefined,
): ActionRunner<Input, Result> {
  let pending = false;
  return {
    get pending() {
      return pending;
    },
    async run(input) {
      if (pending) return undefined;
      pending = true;
      onPendingChange(true);
      try {
        return await callWithRetry(action, input);
      } finally {
        pending = false;
        onPendingChange(false);
      }
    },
  };
}
