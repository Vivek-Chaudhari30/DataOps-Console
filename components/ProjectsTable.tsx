"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Health, ProjectOverview } from "@/lib/metrics";
import { dateFull, num, pct, relativeDays, score } from "@/lib/format";
import { HealthBadge, ProgressBar } from "@/components/ui";

type Filter = "all" | Health;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "at_risk", label: "At risk" },
  { key: "watch", label: "Watch" },
  { key: "on_track", label: "On track" },
];

const paceTone = (pace: number) =>
  pace < 0.85 ? "text-danger" : pace < 0.95 ? "text-warn" : "text-ok";

const deltaTone = (d: number) =>
  d <= -0.05 ? "text-danger" : d <= -0.02 ? "text-warn" : "text-muted";

export function ProjectsTable({ projects }: { projects: ProjectOverview[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: projects.length,
      on_track: 0,
      watch: 0,
      at_risk: 0,
    };
    for (const p of projects) c[p.health]++;
    return c;
  }, [projects]);

  const rows = useMemo(
    () => (filter === "all" ? projects : projects.filter((p) => p.health === filter)),
    [projects, filter]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-accent/50 bg-accent/15 text-foreground"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums opacity-60">
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-medium">Project</th>
              <th className="py-2 pr-3 font-medium">Health</th>
              <th className="py-2 pr-3 font-medium">Progress</th>
              <th className="py-2 pr-3 font-medium text-right">Pace</th>
              <th className="py-2 pr-3 font-medium text-right">Approval</th>
              <th className="py-2 pr-3 font-medium text-right">Quality Δ</th>
              <th className="py-2 font-medium text-right">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="group border-t border-border/60 hover:bg-surface-2/40"
              >
                <td className="py-3 pr-3">
                  <Link href={`/projects/${p.id}`} className="block">
                    <div className="font-medium text-foreground group-hover:text-white">
                      {p.name}
                    </div>
                    <div className="text-xs text-muted">{p.domain}</div>
                  </Link>
                </td>
                <td className="py-3 pr-3">
                  <HealthBadge health={p.health} />
                </td>
                <td className="py-3 pr-3 w-44">
                  <div className="mb-1 flex justify-between text-xs tabular-nums text-muted">
                    <span>
                      {num(p.delivered)} / {num(p.target)}
                    </span>
                    <span>{pct(p.deliveryFraction)}</span>
                  </div>
                  <ProgressBar
                    value={p.deliveryFraction}
                    tone={
                      p.health === "at_risk"
                        ? "danger"
                        : p.health === "watch"
                          ? "warn"
                          : "ok"
                    }
                  />
                </td>
                <td
                  className={`py-3 pr-3 text-right tabular-nums ${paceTone(p.paceRatio)}`}
                >
                  {p.paceRatio.toFixed(2)}×
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">
                  {pct(p.approvalRateRecent)}
                </td>
                <td
                  className={`py-3 pr-3 text-right tabular-nums ${deltaTone(p.qualityDelta)}`}
                >
                  {p.qualityDelta > 0 ? "+" : ""}
                  {score(p.qualityDelta, 3)}
                </td>
                <td className="py-3 text-right">
                  <div className="text-foreground">{dateFull(p.deadline)}</div>
                  <div className="text-xs text-muted">
                    {relativeDays(p.daysRemaining)}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-muted">
                  No projects match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
