"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { FIELD_CLASSES } from "@/components/ui/input";
import { cn } from "@/components/utils";
import { MOVE_REASON_MAX, MOVE_REASON_MIN } from "@/domain/order-moves";

// The reason a warehouse dialog asks for: a transfer's cancel, a write-off's or a count's refusal
// (09-warehouse.md, Other documents: "with a reason"; "A refusal … carries a reason"; plan of
// 7.4c, decided item 7): 5 to 500 characters, as every move (isMoveReason() of
// src/domain/order-moves.ts, which the dialog's confirm and the server both ask). `hint` names the
// message under the field, given {min}, {max} and {count}.

export function ReasonField({
  value,
  onChange,
  disabled,
  hint,
  className = "mt-4",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  hint: "warehouse.reverse.reasonHint" | "warehouse.refuseReason.hint";
  /** The space above it: under the dialog's result sentence by default. */
  className?: string;
}) {
  const tAll = useTranslations();
  const tMoves = useTranslations("orders.moves");
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm leading-5 font-semibold">
        {tMoves("reason")}
      </label>
      <textarea
        id={id}
        data-reason
        value={value}
        rows={3}
        maxLength={MOVE_REASON_MAX}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_CLASSES, "min-h-20 py-2")}
      />
      <p id={`${id}-hint`} className="text-[13px] leading-[18px] text-muted-foreground">
        {tAll(hint, {
          min: MOVE_REASON_MIN,
          max: MOVE_REASON_MAX,
          count: Array.from(value.trim()).length,
        })}
      </p>
    </div>
  );
}
