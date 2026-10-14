"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";

import type { ActionResult } from "@/server/action-result";

import { type ActionCall, createActionRunner } from "./action-runner";
import { newClientKey } from "./client-key";

// The client helper for loading, success and error states (build plan 0.8; 11-screens-and-ux.md,
// smooth feel 4: "Every button shows a loading state at once. Success shows a short message.
// Errors say in plain words what happened and what to do next"). A button reads `pending`; a
// create form passes `create: true` and keeps one client key until a success (smooth feel 7).

export type UseAction<Input, Result> = {
  /** Runs the action; a click while one is pending is ignored. */
  run(input: Input): Promise<ActionResult<Result> | undefined>;
  pending: boolean;
  /** The newest answer, or `null` before the first one. */
  result: ActionResult<Result> | null;
  /** The plain-words text of a refusal, in the user's language. */
  errorText: string | null;
  /** The text of each wrong field, by its path. */
  fieldTexts: Record<string, string>;
};

type WithClientKey<Input> = Input & { clientKey?: string };

export function useAction<Input extends object, Result>(
  action: ActionCall<WithClientKey<Input>, Result>,
  options: { create?: boolean } = {},
): UseAction<Input, Result> {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult<Result> | null>(null);
  // One key per form until a success: every try and every repeated click sends the same one.
  const clientKey = useRef<string | null>(null);
  const runner = useMemo(() => createActionRunner(action, setPending), [action]);
  const create = options.create === true;

  const run = useCallback(
    async (input: Input) => {
      if (create && clientKey.current === null) clientKey.current = newClientKey();
      const sent: WithClientKey<Input> = create
        ? { ...input, clientKey: clientKey.current! }
        : input;
      const answer = await runner.run(sent);
      if (answer === undefined) return undefined;
      if (answer.ok) clientKey.current = null;
      setResult(answer);
      return answer;
    },
    [create, runner],
  );

  const errorText = result && !result.ok ? t(result.error.messageKey) : null;
  const fieldTexts: Record<string, string> = {};
  if (result && !result.ok && result.error.fields) {
    for (const [path, key] of Object.entries(result.error.fields)) fieldTexts[path] = t(key);
  }

  return { run, pending, result, errorText, fieldTexts };
}
