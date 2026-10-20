"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";

// docs/design-system.md, Fields: a segmented control of two to four short choices is a --muted
// track with a hairline edge; the chosen item is white with navy text and a hairline edge, the
// others muted text, at least 32 high (44 at phone width). When the words do not fit on one line
// the choices wrap onto the next line instead of being cut or overlapping. A radio group: arrow
// keys move the choice and focus comes from Base UI Radio Group (11-screens-and-ux.md rule 13).

export type SegmentedOption<Value extends string> = { value: Value; label: string };

export function Segmented<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  pending = false,
  disabled = false,
  className,
}: {
  /** The name of the whole group, read by screen readers; a text from the message files. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  /**
   * The choice is being saved (11-screens-and-ux.md rule 4: "a loading state at once"): the
   * group is disabled and dimmed, and the chosen item shows the turning icon.
   */
  pending?: boolean;
  /** The choice cannot change now, as a product's locked type (1.7): disabled and dimmed. */
  disabled?: boolean;
  className?: string;
}) {
  if (options.length < 2 || options.length > 4) {
    throw new Error(`A segmented control has two to four choices, not ${options.length}.`);
  }
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      onValueChange={(chosen) => onValueChange(chosen as Value)}
      className={cn(
        "inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-muted p-0.5",
        (pending || disabled) && "opacity-60",
        className,
      )}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "inline-flex min-h-11 flex-auto cursor-pointer items-center justify-center rounded-[5px] border border-transparent px-3 py-1 text-center text-sm leading-5 font-medium sm:min-h-8",
            "text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground",
            "data-checked:border-border data-checked:bg-card data-checked:text-foreground data-checked:shadow-xs",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {pending && option.value === value && (
            <Icon name="progress_activity" size={16} className="mr-1.5 animate-spin" />
          )}
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
