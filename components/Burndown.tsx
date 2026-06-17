"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BurndownPoint } from "@/lib/metrics";
import { CHART, dateShort, num } from "@/lib/format";
import { ChartTooltip } from "@/components/ChartTooltip";

/**
 * Remaining items vs an ideal straight line to the deadline. When the actual
 * line sits above ideal, the project is behind schedule.
 */
export function Burndown({
  data,
  height = 240,
}: {
  data: BurndownPoint[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={dateShort}
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v) => num(v as number)}
        />
        <Tooltip
          content={
            <ChartTooltip
              labelText={(l) => dateShort(l)}
              format={(v) => num(v)}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="ideal"
          name="Ideal remaining"
          stroke={CHART.ideal}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Actual remaining"
          stroke={CHART.accent}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
