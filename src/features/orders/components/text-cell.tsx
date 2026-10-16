"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

// A typed cell of the drafts grid (05-order-request-form.md, Drafts 3: autosave; plan of 2.5b,
// decided item 5): what is typed stays local and is saved on blur or Enter when it changed. A
// value the server sends again replaces it only while the cell is not being typed in. A changed,
// unsaved text makes the row dirty for the unsaved-changes guard (11 rule 6; review of the plan,
// Must fix 8).

export function TextCell({
  value,
  label,
  onCommit,
  onDirty,
  error,
  inputMode,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  label: string;
  onCommit(text: string): void;
  onDirty(dirty: boolean): void;
  error?: string;
  inputMode?: "numeric" | "decimal" | "text";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);

  const dirty = text !== value;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  function commit() {
    typing.current = false;
    if (text !== value) onCommit(text);
  }

  return (
    <span className="flex flex-col gap-1">
      <Input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error}
        value={text}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onFocus={() => (typing.current = true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            typing.current = true;
          } else if (event.key === "Escape") {
            setText(value);
          }
        }}
      />
      {error && <span className="text-[13px] leading-4 text-destructive">{error}</span>}
    </span>
  );
}
