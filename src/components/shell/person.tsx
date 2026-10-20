import { cn } from "@/components/utils";

// The person in the menu and the top bar (docs/design-system.md, Layout shell: "a round avatar
// with initials on #1B2A63").

/** The first letters of the first two words of a name, in capitals. */
export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join("");
}

export function Avatar({ fullName, className }: { fullName: string; className?: string }) {
  return (
    // The initials are drawn by CSS, not written as text: a picture of the name, they stay out of
    // the accessible name of the link that holds them (WCAG 2.5.3 Label in Name; plan of 9.1d).
    <span
      aria-hidden="true"
      data-initials={initialsOf(fullName)}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-avatar text-small font-semibold text-sidebar-accent-foreground before:content-[attr(data-initials)]",
        className,
      )}
    />
  );
}
