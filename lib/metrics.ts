/**
 * Metrics layer for the DataOps Console.
 *
 * All the operational KPIs the dashboard renders are derived here, so the UI
 * and the AI features consume one consistent, typed source of truth:
 *   - throughput over time
 *   - quality trend over time
 *   - timeline burndown vs target
 *   - annotator leaderboard
 *   - a deterministic project health classification (+ human-readable reasons)
 *
 * For this dataset (~5k items) we fetch the relevant rows once and aggregate in
 * TypeScript: it keeps the logic readable and obviously correct. At larger
 * scale the daily bucketing would move into SQL (date_trunc + generate_series).
 */
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  startOfDay,
} from "date-fns";
import { prisma } from "@/lib/db";
import type { Annotator, Project } from "@/lib/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal item shape the metric functions need. */
export interface MetricItem {
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  qualityScore: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
  annotatorId: string;
}

export interface ThroughputPoint {
  date: string; // yyyy-MM-dd
  produced: number;
  approved: number;
  rejected: number;
}

export interface QualityPoint {
  date: string;
  avgQuality: number | null;
  reviewed: number;
}

export interface BurndownPoint {
  date: string;
  /** Ideal remaining items on a straight line from target → 0 by deadline. */
  ideal: number;
  /** Actual remaining (target − cumulative approved); null for future days. */
  actual: number | null;
}

export interface LeaderboardRow {
  annotatorId: string;
  name: string;
  speciality: string | null;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  approvalRate: number; // approved / reviewed
  avgQuality: number | null;
  itemsPerActiveDay: number;
}

export type Health = "on_track" | "watch" | "at_risk";

export interface ProjectOverview {
  id: string;
  name: string;
  domain: string;
  status: string;
  startDate: string;
  deadline: string;
  daysRemaining: number;
  target: number;
  produced: number;
  delivered: number; // approved
  inReview: number;
  pending: number;
  rejected: number;
  approvalRate: number;
  approvalRateRecent: number;
  avgQuality: number | null;
  avgQualityRecent: number | null;
  qualityDelta: number; // recent avg − earlier avg
  deliveryFraction: number; // delivered / target
  timeFraction: number; // elapsed / total timeline
  paceRatio: number; // deliveryFraction / timeFraction
  projectedDelivery: number; // extrapolated total at current rate
  health: Health;
  riskReasons: string[];
}

export interface ProjectMetrics {
  overview: ProjectOverview;
  throughput: ThroughputPoint[];
  quality: QualityPoint[];
  burndown: BurndownPoint[];
  leaderboard: LeaderboardRow[];
}

export interface DashboardSummary {
  totalProjects: number;
  activeProjects: number;
  atRiskCount: number;
  totalDelivered: number;
  totalProduced: number;
  overallApprovalRate: number;
}

export interface GlobalMetrics {
  summary: DashboardSummary;
  projects: ProjectOverview[];
  throughput: ThroughputPoint[];
  leaderboard: LeaderboardRow[];
}

const ITEM_SELECT = {
  status: true,
  qualityScore: true,
  createdAt: true,
  reviewedAt: true,
  annotatorId: true,
} as const;

// ---------------------------------------------------------------------------
// Pure aggregation helpers (take rows, return series) — easy to unit test.
// ---------------------------------------------------------------------------

function dayKey(d: Date) {
  return format(startOfDay(d), "yyyy-MM-dd");
}

function dayRange(start: Date, end: Date): string[] {
  if (end < start) return [];
  return eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) }).map(
    (d) => format(d, "yyyy-MM-dd")
  );
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** Daily produced/approved/rejected counts across [start, end]. */
export function computeThroughput(
  items: MetricItem[],
  start: Date,
  end: Date
): ThroughputPoint[] {
  const days = dayRange(start, end);
  const map = new Map<string, ThroughputPoint>(
    days.map((date) => [date, { date, produced: 0, approved: 0, rejected: 0 }])
  );
  for (const it of items) {
    const k = dayKey(it.createdAt);
    const p = map.get(k);
    if (!p) continue;
    p.produced++;
    if (it.status === "APPROVED") p.approved++;
    else if (it.status === "REJECTED") p.rejected++;
  }
  return [...map.values()];
}

/** Daily average quality, bucketed by review date. */
export function computeQuality(
  items: MetricItem[],
  start: Date,
  end: Date
): QualityPoint[] {
  const days = dayRange(start, end);
  const buckets = new Map<string, number[]>(days.map((date) => [date, []]));
  for (const it of items) {
    if (it.qualityScore === null || !it.reviewedAt) continue;
    const k = dayKey(it.reviewedAt);
    buckets.get(k)?.push(it.qualityScore);
  }
  return days.map((date) => {
    const xs = buckets.get(date)!;
    const avg = mean(xs);
    return {
      date,
      avgQuality: avg === null ? null : Number(avg.toFixed(4)),
      reviewed: xs.length,
    };
  });
}

/** Classic burndown: remaining items vs an ideal straight line to the deadline. */
export function computeBurndown(
  project: Pick<Project, "startDate" | "deadline" | "targetItemCount">,
  items: MetricItem[],
  today = new Date()
): BurndownPoint[] {
  const start = startOfDay(project.startDate);
  const end = startOfDay(project.deadline);
  const total = Math.max(1, differenceInCalendarDays(end, start));
  const target = project.targetItemCount;

  // Cumulative approved by review date.
  const approvedByDay = new Map<string, number>();
  for (const it of items) {
    if (it.status === "APPROVED" && it.reviewedAt) {
      const k = dayKey(it.reviewedAt);
      approvedByDay.set(k, (approvedByDay.get(k) ?? 0) + 1);
    }
  }

  const todayKey = dayKey(today);
  let cumulative = 0;
  return dayRange(start, end).map((date, i) => {
    cumulative += approvedByDay.get(date) ?? 0;
    const ideal = Math.max(0, Math.round(target * (1 - i / total)));
    const isFuture = date > todayKey;
    return {
      date,
      ideal,
      actual: isFuture ? null : Math.max(0, target - cumulative),
    };
  });
}

/** Per-annotator productivity and quality. */
export function computeLeaderboard(
  items: MetricItem[],
  annotators: Pick<Annotator, "id" | "name" | "speciality">[]
): LeaderboardRow[] {
  const byId = new Map(annotators.map((a) => [a.id, a]));
  type Acc = {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    quality: number[];
    days: Set<string>;
  };
  const acc = new Map<string, Acc>();
  for (const it of items) {
    let a = acc.get(it.annotatorId);
    if (!a) {
      a = { total: 0, approved: 0, rejected: 0, pending: 0, quality: [], days: new Set() };
      acc.set(it.annotatorId, a);
    }
    a.total++;
    a.days.add(dayKey(it.createdAt));
    if (it.status === "APPROVED") a.approved++;
    else if (it.status === "REJECTED") a.rejected++;
    else a.pending++;
    if (it.qualityScore !== null) a.quality.push(it.qualityScore);
  }

  const rows: LeaderboardRow[] = [];
  for (const [id, a] of acc) {
    const meta = byId.get(id);
    const reviewed = a.approved + a.rejected;
    const avgQ = mean(a.quality);
    rows.push({
      annotatorId: id,
      name: meta?.name ?? "Unknown",
      speciality: meta?.speciality ?? null,
      total: a.total,
      approved: a.approved,
      rejected: a.rejected,
      pending: a.pending,
      approvalRate: reviewed ? a.approved / reviewed : 0,
      avgQuality: avgQ === null ? null : Number(avgQ.toFixed(4)),
      itemsPerActiveDay: a.days.size ? Number((a.total / a.days.size).toFixed(1)) : 0,
    });
  }
  // Rank by delivered, then quality.
  rows.sort(
    (x, y) => y.approved - x.approved || (y.avgQuality ?? 0) - (x.avgQuality ?? 0)
  );
  return rows;
}

/** Average quality over a date-keyed subset of items (by review date). */
function avgQualityBetween(items: MetricItem[], fromKey: string, toKey: string) {
  const xs: number[] = [];
  for (const it of items) {
    if (it.qualityScore === null || !it.reviewedAt) continue;
    const k = dayKey(it.reviewedAt);
    if (k >= fromKey && k <= toKey) xs.push(it.qualityScore);
  }
  return mean(xs);
}

/** Derive a project's overview row, including health and risk reasons. */
export function summarizeProject(
  project: Project,
  items: MetricItem[],
  today = new Date()
): ProjectOverview {
  const start = startOfDay(project.startDate);
  const deadline = startOfDay(project.deadline);
  const now = startOfDay(today);

  const totalDays = Math.max(1, differenceInCalendarDays(deadline, start));
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, differenceInCalendarDays(now, start))
  );
  const timeFraction = elapsedDays / totalDays;

  const produced = items.length;
  const delivered = items.filter((i) => i.status === "APPROVED").length;
  const rejected = items.filter((i) => i.status === "REJECTED").length;
  const inReview = items.filter((i) => i.status === "IN_REVIEW").length;
  const pending = items.filter((i) => i.status === "PENDING").length;
  const reviewed = delivered + rejected;

  const approvalRate = reviewed ? delivered / reviewed : 0;
  const avgQuality = avgQualityBetween(items, "0000-00-00", "9999-99-99");

  // Recent window: the last 10 days of activity.
  const recentFrom = dayKey(
    new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
  );
  const recentKey = dayKey(now);
  const recentItems = items.filter(
    (i) => i.reviewedAt && dayKey(i.reviewedAt) >= recentFrom
  );
  const recentApproved = recentItems.filter((i) => i.status === "APPROVED").length;
  const recentRejected = recentItems.filter((i) => i.status === "REJECTED").length;
  const approvalRateRecent =
    recentApproved + recentRejected
      ? recentApproved / (recentApproved + recentRejected)
      : approvalRate;
  const avgQualityRecent = avgQualityBetween(items, recentFrom, recentKey);

  // Earlier window: the first third of the timeline, for trend comparison.
  const earlierTo = dayKey(
    new Date(start.getTime() + (totalDays / 3) * 24 * 60 * 60 * 1000)
  );
  const avgQualityEarlier = avgQualityBetween(items, dayKey(start), earlierTo);
  const qualityDelta =
    avgQualityRecent !== null && avgQualityEarlier !== null
      ? Number((avgQualityRecent - avgQualityEarlier).toFixed(4))
      : 0;

  const deliveryFraction = delivered / project.targetItemCount;
  const paceRatio = timeFraction > 0 ? deliveryFraction / timeFraction : 0;
  const projectedDelivery = Math.round(
    timeFraction > 0 ? delivered / timeFraction : delivered
  );
  const daysRemaining = differenceInCalendarDays(deadline, now);

  // Health classification + human-readable reasons.
  const riskReasons: string[] = [];
  if (paceRatio < 0.95) {
    riskReasons.push(
      `Behind schedule: ${(deliveryFraction * 100).toFixed(0)}% delivered with ` +
        `${(timeFraction * 100).toFixed(0)}% of the timeline elapsed ` +
        `(pace ${paceRatio.toFixed(2)}×).`
    );
  }
  if (qualityDelta <= -0.02) {
    riskReasons.push(
      `Quality declining: average score down ${Math.abs(qualityDelta * 100).toFixed(0)} ` +
        `points vs. early in the project.`
    );
  }
  if (approvalRateRecent < 0.85) {
    riskReasons.push(
      `Elevated rejection rate: ${((1 - approvalRateRecent) * 100).toFixed(0)}% of ` +
        `recently reviewed items rejected.`
    );
  }

  const severe =
    paceRatio < 0.85 || qualityDelta <= -0.05 || approvalRateRecent < 0.7;
  const mild =
    paceRatio < 0.95 || qualityDelta <= -0.02 || approvalRateRecent < 0.85;
  const health: Health = severe ? "at_risk" : mild ? "watch" : "on_track";

  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    status: project.status,
    startDate: project.startDate.toISOString(),
    deadline: project.deadline.toISOString(),
    daysRemaining,
    target: project.targetItemCount,
    produced,
    delivered,
    inReview,
    pending,
    rejected,
    approvalRate: Number(approvalRate.toFixed(4)),
    approvalRateRecent: Number(approvalRateRecent.toFixed(4)),
    avgQuality: avgQuality === null ? null : Number(avgQuality.toFixed(4)),
    avgQualityRecent:
      avgQualityRecent === null ? null : Number(avgQualityRecent.toFixed(4)),
    qualityDelta,
    deliveryFraction: Number(deliveryFraction.toFixed(4)),
    timeFraction: Number(timeFraction.toFixed(4)),
    paceRatio: Number(paceRatio.toFixed(4)),
    projectedDelivery,
    health,
    riskReasons,
  };
}

// ---------------------------------------------------------------------------
// Data-fetching entry points used by the API routes.
// ---------------------------------------------------------------------------

/** Overview row for every project. */
export async function getProjectsOverview(): Promise<ProjectOverview[]> {
  const projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  const overviews = await Promise.all(
    projects.map(async (p) => {
      const items = await prisma.item.findMany({
        where: { projectId: p.id },
        select: ITEM_SELECT,
      });
      return summarizeProject(p, items);
    })
  );
  return overviews;
}

/** Everything the overview dashboard needs. */
export async function getGlobalMetrics(): Promise<GlobalMetrics> {
  const [projects, items, annotators] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.item.findMany({
      select: { ...ITEM_SELECT, projectId: true },
    }),
    prisma.annotator.findMany({
      select: { id: true, name: true, speciality: true },
    }),
  ]);

  const byProject = new Map<string, MetricItem[]>();
  for (const it of items) {
    const arr = byProject.get(it.projectId) ?? [];
    arr.push(it);
    byProject.set(it.projectId, arr);
  }

  const overviews = projects.map((p) =>
    summarizeProject(p, byProject.get(p.id) ?? [])
  );

  // Aggregate throughput across all projects.
  const allItems: MetricItem[] = items;
  const minDate = allItems.reduce(
    (min, it) => (it.createdAt < min ? it.createdAt : min),
    allItems[0]?.createdAt ?? new Date()
  );
  const throughput = computeThroughput(allItems, minDate, new Date());
  const leaderboard = computeLeaderboard(allItems, annotators);

  const totalDelivered = overviews.reduce((s, o) => s + o.delivered, 0);
  const totalProduced = overviews.reduce((s, o) => s + o.produced, 0);
  const totalRejected = overviews.reduce((s, o) => s + o.rejected, 0);
  const overallApprovalRate =
    totalDelivered + totalRejected
      ? totalDelivered / (totalDelivered + totalRejected)
      : 0;

  const summary: DashboardSummary = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
    atRiskCount: overviews.filter((o) => o.health === "at_risk").length,
    totalDelivered,
    totalProduced,
    overallApprovalRate: Number(overallApprovalRate.toFixed(4)),
  };

  return { summary, projects: overviews, throughput, leaderboard };
}

/** Full metric bundle for a single project's drill-down. */
export async function getProjectMetrics(
  projectId: string
): Promise<ProjectMetrics | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const [items, annotators] = await Promise.all([
    prisma.item.findMany({ where: { projectId }, select: ITEM_SELECT }),
    prisma.annotator.findMany({
      where: { items: { some: { projectId } } },
      select: { id: true, name: true, speciality: true },
    }),
  ]);

  const overview = summarizeProject(project, items);
  const minDate = items.reduce(
    (min, it) => (it.createdAt < min ? it.createdAt : min),
    items[0]?.createdAt ?? project.startDate
  );

  return {
    overview,
    throughput: computeThroughput(items, minDate, new Date()),
    quality: computeQuality(items, minDate, new Date()),
    burndown: computeBurndown(project, items),
    leaderboard: computeLeaderboard(items, annotators),
  };
}
