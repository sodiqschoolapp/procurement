"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";

import { createSentGuard } from "./sent-guard";

// A typed cell of the drafts grid (05-order-request-form.md, Drafts 3: autosave; plan of 2.5b,
// decided item 5): what is typed stays local and is saved on blur or Enter when it changed. A
// value the server sends again replaces it only while the cell is not being typed in. A changed,
// unsaved text makes the row dirty for the unsaved-changes guard (11 rule 6; review of the plan,
// Must fix 8). A save that did not land frees its text, so Enter sends it again (review of the
// plan of 2.6, correction 2). Enter also moves to the next row: drafts-grid.tsx, grid-keys.ts.

export function TextCell({
  value,
  label,
  onCommit,
  onDirty,
  error,
  inputMode,
  money = false,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  label: string;
  /** Sends the text; resolves to false when it was not saved, so it may be sent again. */
  onCommit(text: string): Promise<boolean> | void;
  onDirty(dirty: boolean): void;
  error?: string;
  inputMode?: "numeric" | "decimal" | "text";
  /** A money cell: the digits shown grouped as typed, the same digits saved (MoneyInput). */
  money?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const typing = useRef(false);
  // Enter commits and the blur after it would commit the same text again (spec review, Should
  // fix 2): a text already sent is not sent twice until the server's value changes.
  const [sent] = useState(createSentGuard);

  useEffect(() => {
    sent.reset();
    if (!typing.current) setText(value);
  }, [value, sent]);

  const dirty = text !== value;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  function commit() {
    typing.current = false;
    if (!sent.take(text, value)) return;
    const committed = text;
    void Promise.resolve(onCommit(committed)).then((saved) => {
      if (saved === false) sent.failed(committed);
    });
  }

  const shared = {
    "aria-label": label,
    "aria-invalid": error ? true : undefined,
    title: error,
    placeholder,
    disabled,
    className,
    onFocus: () => {
      typing.current = true;
      sent.reset();
    },
    onBlur: commit,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        typing.current = true;
      } else if (event.key === "Escape") {
        setText(value);
      }
    },
  };

  return (
    <span className="flex flex-col gap-1">
      {money ? (
        <MoneyInput {...shared} value={text} onValueChange={setText} />
      ) : (
        <Input
          {...shared}
          value={text}
          inputMode={inputMode}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
