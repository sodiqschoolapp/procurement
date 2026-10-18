import type { ChartPoint } from "./chart-point";

// The hover box of a chart: the label, the amount and its change, in text tokens.

export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm leading-5 text-popover-foreground shadow-float">
      <p className="font-semibold">{point.label}</p>
      <p className="tabular-nums">{point.shown}</p>
      {point.change && <p className="text-muted-foreground tabular-nums">{point.change}</p>}
    </div>
  );
}
