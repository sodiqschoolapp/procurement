"use client";

import { type ReactNode, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

// The fold of the Analytics filters at phone width (plan of 6.3, Screens: "at 375 px the period
// picker and filters fold behind a Filters button"). From 640 px the fields always show and the
// button is gone. `bare` folds fields inside a list's own filter form (warehouse documents,
// products; redesign of 22.10.2026): no panel of its own, a secondary button on a phone, and from
// 640 px its fields stand in the form's row as before.

export function FilterFold({
  label,
  bare = false,
  children,
}: {
  label: string;
  bare?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={bare ? "contents" : "rounded-xl border border-border bg-card p-4"}
      data-filter-bar
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        className={
          bare
            ? cn(buttonVariants({ variant: "secondary" }), "sm:hidden")
            : "flex min-h-11 w-full items-center text-sm font-semibold sm:hidden"
        }
        data-filter-toggle
      >
        {label}
      </button>
      <div
        className={cn(
          bare ? "contents" : "max-sm:mt-3",
          !open && (bare ? "max-sm:[&>*]:hidden" : "max-sm:hidden"),
        )}
      >
        {children}
      </div>
    </div>
  );
}
