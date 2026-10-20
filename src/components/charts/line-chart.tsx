"use client";

import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { type ChartPoint, pointAt } from "./chart-point";
import { ChartTooltip } from "./chart-tooltip";

// A line chart of one series over time on Recharts (13-technology.md, Charts; build-plan 6.3): a
// 2 px line with markers, a recessive grid, a crosshair with the hover box, and a click on a point
// that opens the drill-down behind it (10 point 3). As BarChartBlock: one series, no legend, the
// theme's foreground colour (decided item 17), the table under it for the keyboard.

export function LineChartBlock({
  points,
  label,
}: {
  points: readonly ChartPoint[];
  label: string;
}) {
  const router = useRouter();
  // One point draws an empty-looking chart: the table under it carries the number alone
  // (redesign of 21.10.2026).
  if (points.length < 2) return null;
  return (
    <div className="h-64 w-full" aria-hidden="true" data-chart="line" title={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer={false}
          data={[...points]}
          margin={{ top: 8, right: 16, bottom: 0, left: 16 }}
          onClick={(state) => {
            const point = pointAt(points, state.activeIndex);
            if (point) router.push(point.href);
          }}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--muted-foreground)" }} />
          <Line
            dataKey="value"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
