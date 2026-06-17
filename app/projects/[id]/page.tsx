import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectMetrics } from "@/lib/metrics";
import { dateFull, num, pct, relativeDays, score } from "@/lib/format";
import { Card, HealthBadge, StatCard } from "@/components/ui";
import { ThroughputChart } from "@/components/ThroughputChart";
import { QualityTrend } from "@/components/QualityTrend";
import { Burndown } from "@/components/Burndown";
import { AnnotatorTable } from "@/components/AnnotatorTable";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const metrics = await getProjectMetrics(id);
  if (!metrics) notFound();

  const { overview: o, throughput, quality, burndown, leaderboard } = metrics;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Overview
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{o.name}</h1>
          <HealthBadge health={o.health} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {o.domain} · deadline {dateFull(o.deadline)} (
          {relativeDays(o.daysRemaining)})
        </p>
      </div>

      {/* Risk reasons callout */}
      {o.riskReasons.length > 0 && (
        <div
          className={`rounded-xl border p-4 ${
            o.health === "at_risk"
              ? "border-danger/30 bg-danger/10"
              : "border-warn/30 bg-warn/10"
          }`}
        >
          <p className="text-sm font-medium text-foreground">
            {o.health === "at_risk" ? "At risk" : "Watch"} — why
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {o.riskReasons.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Delivered"
          value={`${pct(o.deliveryFraction)}`}
          hint={`${num(o.delivered)} / ${num(o.target)}`}
        />
        <StatCard
          label="Pace"
          value={`${o.paceRatio.toFixed(2)}×`}
          hint={`${pct(o.timeFraction)} time elapsed`}
          tone={
            o.paceRatio < 0.85 ? "danger" : o.paceRatio < 0.95 ? "warn" : "ok"
          }
        />
        <StatCard
          label="Recent approval"
          value={pct(o.approvalRateRecent)}
          hint="last 10 days"
          tone={
            o.approvalRateRecent >= 0.85
              ? "ok"
              : o.approvalRateRecent >= 0.7
                ? "warn"
                : "danger"
          }
        />
        <StatCard
          label="Recent quality"
          value={score(o.avgQualityRecent)}
          hint={`Δ ${o.qualityDelta > 0 ? "+" : ""}${score(o.qualityDelta, 3)} vs early`}
          tone={
            o.qualityDelta <= -0.05
              ? "danger"
              : o.qualityDelta <= -0.02
                ? "warn"
                : "ok"
          }
        />
        <StatCard
          label="In pipeline"
          value={num(o.pending + o.inReview)}
          hint={`${num(o.pending)} pending · ${num(o.inReview)} in review`}
        />
      </div>

      <Card
        title="Throughput"
        subtitle="Items produced per day (approved vs rejected)"
      >
        <ThroughputChart data={throughput} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Quality trend"
          subtitle="Average reviewer score over time"
        >
          <QualityTrend data={quality} />
        </Card>
        <Card
          title="Burndown vs target"
          subtitle="Remaining items vs the ideal line to deadline"
        >
          <Burndown data={burndown} />
        </Card>
      </div>

      <Card
        title="Annotators"
        subtitle="Performance on this project"
      >
        <AnnotatorTable rows={leaderboard} />
      </Card>
    </div>
  );
}
