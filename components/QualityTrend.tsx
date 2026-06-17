"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { QualityPoint } from "@/lib/metrics";
import { CHART, dateShort, score } from "@/lib/format";
import { ChartTooltip } from "@/components/ChartTooltip";

/** Average quality score over time, with the QA reject threshold marked. */
export function QualityTrend({
  data,
  threshold = 0.62,
  height = 240,
}: {
  data: QualityPoint[];
  threshold?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
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
          domain={[0.3, 1]}
          tickFormatter={(v) => v.toFixed(1)}
          tick={{ fill: CHART.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <ReferenceLine
          y={threshold}
          stroke={CHART.danger}
          strokeDasharray="4 4"
          strokeOpacity={0.6}
          label={{
            value: `reject < ${threshold}`,
            position: "insideBottomRight",
            fill: CHART.danger,
            fontSize: 10,
          }}
        />
        <Tooltip
          content={
            <ChartTooltip
              labelText={(l) => dateShort(l)}
              format={(v) => score(v, 3)}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="avgQuality"
          name="Avg quality"
          stroke={CHART.sky}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
