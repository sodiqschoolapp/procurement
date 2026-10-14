"use client";

import type { ComponentProps } from "react";

import { cn } from "@/components/utils";

import { useFieldControl } from "./field";

// docs/design-system.md, "Fields and switches": 40 high (44 at phone width, 48 on sign-in),
// white fill, 1 px --input border, corner 8; focus is the 2 px ring; an error is a 2 px
// --destructive border.

export const FIELD_SIZES = {
  default: "h-11 sm:h-10",
  lg: "h-12",
} as const;

export const FIELD_CLASSES = [
  "w-full rounded-lg border border-input bg-card px-3 text-base leading-6 text-foreground sm:text-sm sm:leading-5",
  "transition-colors duration-120 ease-out",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "aria-invalid:border-2 aria-invalid:border-destructive",
  "disabled:cursor-not-allowed disabled:opacity-60",
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
