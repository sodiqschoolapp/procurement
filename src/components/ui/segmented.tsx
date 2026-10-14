"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "@/components/utils";

// docs/design-system.md, "Fields and switches": a segmented control of two to four choices is
// an --accent track with 4 px padding; the chosen item is white with navy text, the others muted
// text, 32 high (44 at phone width). A radio group: arrow keys move the choice and focus comes
// from Base UI Radio Group (11-screens-and-ux.md rule 13).

export type SegmentedOption<Value extends string> = { value: Value; label: string };

export function Segmented<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: {
  /** The name of the whole group, read by screen readers; a text from the message files. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
}) {
  if (options.length < 2 || options.length > 4) {
    throw new Error(`A segmented control has two to four choices, not ${options.length}.`);
  }
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(chosen) => onValueChange(chosen as Value)}
      className={cn("inline-flex rounded-lg bg-accent p-1", className)}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "inline-flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-sm leading-5 font-semibold whitespace-nowrap sm:h-8",
            "text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground",
            "data-checked:bg-card data-checked:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
