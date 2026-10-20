"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";
import { isBusinessDate } from "@/domain/business-date";
import { formatDate, parseTypedDate } from "@/i18n/format";

import { useFieldControl } from "./field";
import { FIELD_CLASSES, FIELD_SIZES } from "./input";

// A date field that shows and takes dd.mm.yyyy (docs/design-system.md, Fields: "Dates are shown
// and typed as dd.mm.yyyy everywhere, never the browser's own date format"; 11-screens-and-ux.md
// rule 10). The browser's own date field shows the order of the device's language, mm/dd/yyyy on
// an English device, so the person types into a text field instead; the calendar button opens the
// browser's picker on a hidden date field. The value it gives and sends is the same `YYYY-MM-DD`
// text as before: a GET form gets it from a hidden field of the same name, a form in React gets
// it through `onValueChange`. A date typed as `YYYY-MM-DD` is read too.

/** The digits typed so far, with the dots put in: `2110` → `21.10`. */
function withDots(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/** The `YYYY-MM-DD` of a typed text, or "" while it is not a whole, real date. */
function isoOf(text: string): string {
  const trimmed = text.trim();
  if (isBusinessDate(trimmed)) return trimmed;
  return parseTypedDate(trimmed) ?? "";
}

function shown(iso: string | undefined | null): string {
  return iso && isBusinessDate(iso) ? formatDate(iso) : "";
}

export function DateInput({
  name,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  disabled,
  fieldSize = "default",
  className,
  ...rest
}: Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "name"
> & {
  /** For a GET form: the name of the hidden field that carries `YYYY-MM-DD`. */
  name?: string;
  /** The `YYYY-MM-DD` value of a form in React. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (iso: string) => void;
  min?: string;
  max?: string;
  fieldSize?: keyof typeof FIELD_SIZES;
}) {
  const t = useTranslations("dateInput");
  const control = useFieldControl();
  const picker = useRef<HTMLInputElement>(null);
  const [iso, setIso] = useState(value ?? defaultValue ?? "");
  const [text, setText] = useState(shown(value ?? defaultValue));
  // A value the form sets from outside (a reset, a prefill) replaces what is shown.
  const [seen, setSeen] = useState(value);
  if (value !== undefined && value !== seen) {
    setSeen(value);
    setIso(value);
    if (isoOf(text) !== value) setText(shown(value));
  }

  function take(next: string, typed: string) {
    setText(typed);
    if (next !== iso) {
      setIso(next);
      onValueChange?.(next);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        {...control}
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t("placeholder")}
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const typed = event.target.value;
          // A whole `YYYY-MM-DD` (pasted, or filled by a test) is taken as it is.
          if (isBusinessDate(typed.trim())) {
            take(typed.trim(), shown(typed.trim()));
            return;
          }
          const dotted = typed.length < text.length ? typed : withDots(typed);
          take(isoOf(dotted), dotted);
        }}
        className={cn(FIELD_CLASSES, FIELD_SIZES[fieldSize], "pr-10")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("pick")}
        title={t("pick")}
        disabled={disabled}
        onClick={() => {
          const field = picker.current;
          if (!field) return;
          try {
            field.showPicker();
          } catch {
            field.focus();
          }
        }}
        className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none sm:size-7"
      >
        <Icon name="calendar_month" size={18} />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={iso}
        onChange={(event) => take(event.target.value, shown(event.target.value))}
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </div>
  );
}
