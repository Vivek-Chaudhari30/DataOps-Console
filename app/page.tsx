import { getGlobalMetrics } from "@/lib/metrics";
import { num, pct } from "@/lib/format";
import { Card, StatCard } from "@/components/ui";
import { ThroughputChart } from "@/components/ThroughputChart";
import { ProjectsTable } from "@/components/ProjectsTable";
import { AnnotatorTable } from "@/components/AnnotatorTable";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { summary, projects, throughput, leaderboard } =
    await getGlobalMetrics();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Operations overview
        </h1>
        <p className="mt-1 text-sm text-muted">
          {summary.activeProjects} active dataset-generation projects ·{" "}
          {num(summary.totalProduced)} items produced to date
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active projects"
          value={summary.activeProjects}
          hint={`${summary.totalProjects} total`}
        />
        <StatCard
          label="Items delivered"
          value={num(summary.totalDelivered)}
          hint={`${num(summary.totalProduced)} produced`}
        />
        <StatCard
          label="Overall approval"
          value={pct(summary.overallApprovalRate, 1)}
          hint="approved / reviewed"
          tone={
            summary.overallApprovalRate >= 0.85
              ? "ok"
              : summary.overallApprovalRate >= 0.75
                ? "warn"
                : "danger"
          }
        />
        <StatCard
          label="At-risk projects"
          value={summary.atRiskCount}
          hint={
            summary.atRiskCount > 0 ? "need attention" : "all healthy"
          }
          tone={summary.atRiskCount > 0 ? "danger" : "ok"}
        />
      </div>

      <Card
        title="Throughput"
        subtitle="Items produced per day across all projects (approved vs rejected)"
      >
        <ThroughputChart data={throughput} />
      </Card>

      <Card title="Projects" subtitle="Health, progress and pace — click a row to drill in">
        <ProjectsTable projects={projects} />
      </Card>

      <Card
        title="Annotator leaderboard"
        subtitle="Ranked by items delivered across all projects"
      >
        <AnnotatorTable rows={leaderboard} limit={10} />
      </Card>
    </div>
  );
}
