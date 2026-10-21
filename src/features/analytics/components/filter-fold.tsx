"use client";

import { type ReactNode, useState } from "react";

import { cn } from "@/components/utils";

// The fold of the Analytics filters at phone width (plan of 6.3, Screens: "at 375 px the period
// picker and filters fold behind a Filters button"). From 640 px the fields always show and the
// button is gone.

export function FilterFold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-filter-bar>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        className="flex min-h-11 w-full items-center text-sm font-semibold sm:hidden"
        data-filter-toggle
      >
        {label}
      </button>
      <div className={cn("max-sm:mt-3", !open && "max-sm:hidden")}>{children}</div>
    </div>
  );
}
