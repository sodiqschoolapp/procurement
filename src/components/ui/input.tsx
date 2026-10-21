"use client";

import type { ComponentProps } from "react";

import { cn } from "@/components/utils";

import { useFieldControl } from "./field";

// docs/design-system.md, Fields: 40 high (44 at phone width and on sign-in), white fill, 1 px
// --input border, corner 6; focus is the 2 px ring; an error is a --destructive border. 16 px
// text at phone width, so a phone does not zoom into the field.

export const FIELD_SIZES = {
  default: "h-11 sm:h-10",
  lg: "h-12 sm:h-11",
} as const;

export const FIELD_CLASSES = [
  "w-full rounded-md border border-input bg-card px-3 text-base leading-6 text-foreground shadow-xs sm:text-sm sm:leading-5",
  "placeholder:text-muted-foreground transition-colors duration-120 ease-out",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
  "aria-invalid:border-destructive aria-invalid:outline-destructive",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
].join(" ");

export function Input({
  className,
  fieldSize = "default",
  ...props
}: ComponentProps<"input"> & { fieldSize?: keyof typeof FIELD_SIZES }) {
  return (
    <input
      {...useFieldControl()}
      {...props}
      className={cn(FIELD_CLASSES, FIELD_SIZES[fieldSize], className)}
    />
  );
}
