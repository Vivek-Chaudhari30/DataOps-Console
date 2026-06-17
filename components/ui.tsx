import type { ReactNode } from "react";
import type { Health } from "@/lib/metrics";
import { HEALTH_LABEL } from "@/lib/format";

/** Card surface used to frame charts, tables and sections. */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={title ? "px-5 pb-5" : "p-5"}>{children}</div>
    </section>
  );
}

const HEALTH_STYLES: Record<Health, string> = {
  on_track: "bg-ok/15 text-ok border-ok/30",
  watch: "bg-warn/15 text-warn border-warn/30",
  at_risk: "bg-danger/15 text-danger border-danger/30",
};

export function HealthBadge({ health }: { health: Health }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${HEALTH_STYLES[health]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

/** KPI tile for the top-of-page stat row. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const toneColor =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneColor}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Horizontal progress bar (delivered vs target, etc.). */
export function ProgressBar({
  value,
  tone = "accent",
}: {
  value: number; // 0..1 (can exceed 1; clamped for the bar)
  tone?: "accent" | "ok" | "warn" | "danger";
}) {
  const pctWidth = Math.min(100, Math.max(0, value * 100));
  const barColor =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full ${barColor}`}
        style={{ width: `${pctWidth}%` }}
      />
    </div>
  );
}
