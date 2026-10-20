import { cn } from "@/components/utils";

// The brand's hexagon pattern, on the sign-in panel (docs/design-system.md, This app, Sign-in).
// Decoration only, hidden from screen readers. Pointy-top hexagons on a honeycomb grid.

/** The points of a pointy-top hexagon of radius r around (x, y). */
export function hexagonPoints(x: number, y: number, r: number): string {
  return [0, 1, 2, 3, 4, 5]
    .map((k) => {
      const angle = ((60 * k - 90) * Math.PI) / 180;
      return `${(x + r * Math.cos(angle)).toFixed(2)},${(y + r * Math.sin(angle)).toFixed(2)}`;
    })
    .join(" ");
}

const R = 20;
const W = Math.sqrt(3) * R;

/** A column of hexagon outlines with an orange one now and then, at the sign-in panel's edge. */
export function HexagonColumn({ className }: { className?: string }) {
  // Enough rows for a tall screen; the column is cut at the bottom, never at the sides.
  const rows = 40;
  const width = Math.ceil(2 * W + 8);
  const height = Math.ceil(rows * 1.5 * R + R);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {Array.from({ length: rows }, (_, row) => {
        const x = 4 + W / 2 + (row % 2 === 1 ? W / 2 : 0);
        const y = R + row * 1.5 * R;
        const filled = row % 3 === 1;
        return (
          <polygon
            key={row}
            points={hexagonPoints(x, y, R - 3)}
            className={filled ? "fill-brand" : "fill-none stroke-border-strong"}
            strokeWidth={filled ? 0 : 2.5}
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
