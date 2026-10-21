"use client";

import { type ComponentProps, type Ref, useLayoutEffect, useRef } from "react";

import { cn } from "@/components/utils";
import { formatTypedAmount, retypeAmount } from "@/i18n/format";

import { Input } from "./input";

// A money field (11-screens-and-ux.md rule 10; redesign of 21.10.2026): it shows the digits grouped
// as they are typed, `60 000`, and holds and sends exactly the digits it sent before, `60000`. The
// grouping is only what the field shows (formatTypedAmount and retypeAmount of the formatters).

export function MoneyInput({
  value,
  onValueChange,
  ref,
  maxLength,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type"> & {
  /** What the field holds and sends: the typed text without the spaces of the grouping. */
  value: string;
  onValueChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const own = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // After the grouped text is drawn, the caret goes back after the digit just typed.
  useLayoutEffect(() => {
    const input = own.current;
    if (caret.current === null || input === null) return;
    if (input === document.activeElement) input.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <Input
      {...props}
      ref={(element) => {
        own.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      // As many digits as before; the group spaces come on top.
      maxLength={maxLength === undefined ? undefined : maxLength + Math.floor((maxLength - 1) / 3)}
      value={formatTypedAmount(value)}
      onChange={(event) => {
        const typed = event.target.value;
        const next = retypeAmount(typed, event.target.selectionStart ?? typed.length);
        caret.current = next.caret;
        onValueChange(next.value);
      }}
      className={cn("tabular-nums", className)}
    />
  );
}
