// One point or bar of an Analytics chart (10-notifications-analytics-reports.md, Analytics page per
// role, point 3: "Clicking any bar, slice or number opens the list … that make it up"; build-plan
// 6.3). The server gives every text: the label, the amount already formatted, its change and the
// address of its drill-down. `value` is the amount as a number for the drawing only, the height of
// a bar or a point; no amount is ever shown or added from it (CLAUDE.md rule 6).

export type ChartPoint = {
  key: string;
  label: string;
  value: number;
  /** The amount as the formatters write it. */
  shown: string;
  /** The change against the period before, as written; empty when none. */
  change: string;
  href: string;
};

/** The point of the index a click on the chart names, if any. */
export function pointAt(points: readonly ChartPoint[], index: unknown): ChartPoint | undefined {
  const at = typeof index === "number" ? index : Number(index);
  return Number.isInteger(at) ? points[at] : undefined;
}
