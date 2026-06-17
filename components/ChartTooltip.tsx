"use client";

import type { TooltipContentProps } from "recharts";
import { CHART } from "@/lib/format";

/**
 * Dark-theme tooltip shared by all charts. Recharts injects the data props at
 * runtime, so those are optional here; `format`/`labelText` are ours.
 */
type Props = Partial<TooltipContentProps<number, string>> & {
  labelText?: (label: string) => string;
  format?: (value: number, name: string) => string;
};

export function ChartTooltip({
  active,
  payload,
  label,
  labelText,
  format = (v) => String(v),
}: Props) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: CHART.tooltipBg, borderColor: CHART.tooltipBorder }}
    >
      <p className="mb-1 font-medium text-foreground">
        {labelText ? labelText(String(label)) : String(label)}
      </p>
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: p.color }}
            />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {p.value === null || p.value === undefined
                ? "—"
                : format(p.value as number, String(p.name))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
