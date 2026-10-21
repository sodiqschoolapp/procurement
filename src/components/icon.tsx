import { cn } from "@/components/utils";

import { FILLED_ICON_PATHS, ICON_PATHS, type IconName } from "./icon-paths";

export type { IconName };

/** 20 in menus, buttons and fields; 24 on phone screens; 16 or 18 inline with small text. */
export type IconSize = 16 | 18 | 20 | 24;

/**
 * A Material Symbols Rounded icon drawn from its SVG path (docs/design-system.md, Icons: one set
 * only, never a font ligature): outlined, or filled for the active menu item when the set has its
 * filled path. Decoration is hidden from screen readers; an icon that carries meaning alone gets
 * `label`, a text from the message files.
 */
export function Icon({
  name,
  size = 20,
  label,
  filled = false,
  className,
}: {
  name: IconName;
  size?: IconSize;
  label?: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("shrink-0", className)}
    >
      <path d={(filled && FILLED_ICON_PATHS[name]) || ICON_PATHS[name]} />
    </svg>
  );
}
