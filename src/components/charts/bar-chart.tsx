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
  const onClick = (state: { activeIndex?: number | string | null }) => {
    const point = pointAt(points, state.activeIndex);
    if (point) router.push(point.href);
  };
  // Up to three bars lie across, one short row each, so one bar never stands alone in a tall
  // empty chart (redesign of 21.10.2026); more stand up as columns.
  if (points.length <= 3) {
    return (
      <div
        className="w-full"
        style={{ height: points.length * 44 + 8 }}
        aria-hidden="true"
        data-chart="bar"
        title={label}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer={false}
            layout="vertical"
            data={[...points]}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            onClick={onClick}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar
              dataKey="value"
              fill="var(--chart-1)"
              radius={[0, 4, 4, 0]}
              barSize={20}
              className="cursor-pointer"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="h-64 w-full" aria-hidden="true" data-chart="bar" title={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={[...points]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={onClick}
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
            fill="var(--chart-1)"
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
