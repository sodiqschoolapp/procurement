import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/components/utils";

// docs/design-system.md, Buttons: three sizes, four kinds, one shape; every button is a fill
// with no border ("What we never do" 6). Sizes `sm` 32 and `default` 40 (both 44 at phone width), `lg`
// 48 and the square `icon-sm`, `icon`, `icon-lg`; kinds `default` (primary), `secondary`, `ghost`
// (quiet), `destructive` (danger, no fill until hover). No `xs`, `outline` or `link`. A link
// styled as a button uses `buttonVariants()`.

export const BUTTON_KINDS = {
  default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-hover",
  ghost: "bg-transparent text-foreground hover:bg-accent active:bg-accent",
  destructive: "bg-transparent text-destructive hover:bg-destructive-bg active:bg-destructive-bg",
} as const;

export const BUTTON_SIZES = {
  sm: "h-11 px-3 text-[13px] leading-4 sm:h-8",
  default: "h-11 px-4 text-sm leading-5 sm:h-10",
  lg: "h-12 px-5 text-base leading-6",
  "icon-sm": "size-11 sm:size-8",
  icon: "size-11 sm:size-10",
  "icon-lg": "size-12",
} as const;

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap select-none",
    "transition-colors duration-120 ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress aria-busy:opacity-100",
  ],
  {
    variants: { variant: BUTTON_KINDS, size: BUTTON_SIZES },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** The icon before the words (20 px). */
    icon?: IconName;
    /**
     * The action is running (11-screens-and-ux.md rule 4: "Every button shows a loading state
     * at once"): the button is disabled and `aria-busy`, and the turning `progress_activity`
     * icon takes the place of its icon, or covers its words, so the button keeps its width.
     */
    pending?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  icon,
  pending = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const spinner = <Icon name="progress_activity" className="animate-spin" />;
  const wordsOnly = icon === undefined;
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {icon !== undefined && (pending ? spinner : <Icon name={icon} />)}
      {pending && wordsOnly ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">{spinner}</span>
          <span className="opacity-0">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
