import { cn } from "@/components/utils";

// The brand's hexagon pattern (docs/design-system.md, Brand moments). Decoration only, hidden
// from screen readers. Pointy-top hexagons on a honeycomb grid.

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

/** Cells of the empty-page drawing: [column, row, filled]. */
const CLUSTER: readonly (readonly [number, number, boolean])[] = [
  [1, 0, false],
  [2, 0, false],
  [0, 1, false],
  [1, 1, true],
  [2, 1, false],
  [1, 2, false],
  [2, 2, true],
  [3, 1, false],
];

function cellCentre(column: number, row: number): [number, number] {
  return [2 + W / 2 + column * W + (row % 2 === 1 ? W / 2 : 0), 2 + R + row * 1.5 * R];
}

/**
 * The empty page's drawing: navy hexagon outlines with two orange filled ones (design system,
 * "Empty page").
 */
export function HexagonCluster({ className }: { className?: string }) {
  const width = Math.ceil(5 * W + 4);
  const height = Math.ceil(3 * 1.5 * R + R + 4);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      {CLUSTER.map(([column, row, filled]) => {
        const [x, y] = cellCentre(column, row);
        return (
          <polygon
            key={`${column}-${row}`}
            points={hexagonPoints(x, y, R - 2)}
            className={filled ? "fill-primary" : "fill-none stroke-foreground"}
            strokeWidth={filled ? 0 : 2}
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

/**
 * The white column of orange hexagons on the navy sign-in panel (design system, Sign-in: "the
 * brand book's cover").
 */
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
            className={filled ? "fill-primary" : "fill-none stroke-primary"}
            strokeWidth={filled ? 0 : 2.5}
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
