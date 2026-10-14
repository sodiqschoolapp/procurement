"use client";

import type { ComponentProps } from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";

import { useFieldControl } from "./field";
import { FIELD_CLASSES, FIELD_SIZES } from "./input";

// docs/design-system.md, "Fields and switches": a select looks like a field and draws a filled
// "expand more" icon on the right, never a text caret. A native <select>, so phones show their
// own list and the keyboard works as the browser makes it.

export function Select({
  className,
  fieldSize = "default",
  children,
  ...props
}: ComponentProps<"select"> & { fieldSize?: keyof typeof FIELD_SIZES }) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...useFieldControl()}
        {...props}
        className={cn(FIELD_CLASSES, FIELD_SIZES[fieldSize], "appearance-none pr-10 font-semibold")}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-foreground"
      />
    </div>
  );
}
