"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ThroughputPoint } from "@/lib/metrics";
import { CHART, dateShort } from "@/lib/format";
import { ChartTooltip } from "@/components/ChartTooltip";

/** Daily produced items, split into approved vs rejected (stacked). */
export function ThroughputChart({
  data,
  height = 260,
}: {
  data: ThroughputPoint[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
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
          width={44}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={
            <ChartTooltip
              labelText={(l) => dateShort(l)}
              format={(v) => String(v)}
            />
          }
        />
        <Bar
          dataKey="approved"
          name="Approved"
          stackId="a"
          fill={CHART.ok}
          radius={[0, 0, 0, 0]}
          maxBarSize={22}
        />
        <Bar
          dataKey="rejected"
          name="Rejected"
          stackId="a"
          fill={CHART.danger}
          radius={[2, 2, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
