"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { type ChartPoint, pointAt } from "./chart-point";
import { ChartTooltip } from "./chart-tooltip";

// A bar chart of one series on Recharts (13-technology.md, Charts; build-plan 6.3): thin bars with
// rounded ends on the baseline, a recessive grid, a hover box, and a click on a bar that opens the
// drill-down behind it (10 point 3). One series, so no legend: the block's title names it. The
// marks are the foreground colour of the theme (plan of 6.3, decided item 17): calm, and orange
// stays for actions (docs/design-system.md). The table under the chart carries the same numbers
// for the keyboard and a screen reader, so the drawing itself is hidden from them.

export function BarChartBlock({ points, label }: { points: readonly ChartPoint[]; label: string }) {
  const router = useRouter();
  return (
    <div className="h-64 w-full" aria-hidden="true" data-chart="bar" title={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={[...points]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            const point = pointAt(points, state.activeIndex);
            if (point) router.push(point.href);
          }}
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
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar
            dataKey="value"
            fill="var(--foreground)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            className="cursor-pointer"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
