/**
 * Synthetic data seed for the DataOps Console.
 *
 * Goal: produce data that *looks like* the reality of running several concurrent
 * dataset-generation projects for an AI lab, so the dashboard's charts and AI
 * risk flags have real shape:
 *
 *   - ~6 weeks of history, with weekday-weighted daily output.
 *   - A deliberate mix of HEALTHY and AT-RISK projects (throughput decay,
 *     quality drift, behind-burndown).
 *   - Annotators with distinct speed/quality profiles so the leaderboard and
 *     quality trends spread out.
 *
 * The randomness is seeded (deterministic) so every run produces the same data
 * set — handy for screenshots and for reasoning about the AI outputs.
 */
import "dotenv/config";
import {
  addDays,
  differenceInCalendarDays,
  startOfDay,
  subDays,
} from "date-fns";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ItemStatus } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) so seeds are reproducible across runs.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(42);

const rand = () => rng();
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
/** Seeded Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Sample a normal-ish value via averaging, clamped to [0,1]. */
function clampedNormal(mean: number, spread: number) {
  const noise = (rand() + rand() + rand()) / 3 - 0.5; // ~N(0, small)
  return Math.min(1, Math.max(0, mean + noise * spread * 2));
}

const HISTORY_DAYS = 42; // ~6 weeks
const TODAY = startOfDay(new Date());
const START = subDays(TODAY, HISTORY_DAYS);

// ---------------------------------------------------------------------------
// Annotator profiles — speed (items/day) and quality characteristics.
// ---------------------------------------------------------------------------
type Profile = "fast_accurate" | "fast_noisy" | "slow_accurate" | "average";

const PROFILE_CONFIG: Record<
  Profile,
  { dailyMin: number; dailyMax: number; qualityMean: number; qualitySpread: number }
> = {
  fast_accurate: { dailyMin: 6, dailyMax: 11, qualityMean: 0.9, qualitySpread: 0.12 },
  fast_noisy: { dailyMin: 7, dailyMax: 13, qualityMean: 0.64, qualitySpread: 0.28 },
  slow_accurate: { dailyMin: 2, dailyMax: 5, qualityMean: 0.93, qualitySpread: 0.1 },
  average: { dailyMin: 4, dailyMax: 8, qualityMean: 0.8, qualitySpread: 0.2 },
};

// Items scoring below this are rejected during QA.
const REJECT_THRESHOLD = 0.62;
// Target pace = deliveryFraction / timeFraction. Calibrate per health so the
// pace label matches the intended story (healthy on-pace, at-risk behind).
const TARGET_PACE: Record<Health, number> = { healthy: 1.08, at_risk: 0.78 };

const ANNOTATOR_SEED: { name: string; speciality: string; profile: Profile }[] = [
  { name: "Ava Chen", speciality: "Python", profile: "fast_accurate" },
  { name: "Marco Diaz", speciality: "Competition math", profile: "slow_accurate" },
  { name: "Priya Nair", speciality: "Tool-use traces", profile: "fast_accurate" },
  { name: "Tom Becker", speciality: "Web/JS", profile: "fast_noisy" },
  { name: "Sofia Rossi", speciality: "Algorithms", profile: "average" },
  { name: "Liam O'Connor", speciality: "Systems", profile: "average" },
  { name: "Yuki Tanaka", speciality: "Math reasoning", profile: "slow_accurate" },
  { name: "Noah Smith", speciality: "Data wrangling", profile: "fast_noisy" },
  { name: "Elena Petrova", speciality: "SQL", profile: "average" },
  { name: "Raj Patel", speciality: "Python", profile: "fast_accurate" },
  { name: "Hannah Kim", speciality: "Rust", profile: "average" },
  { name: "Diego Morales", speciality: "Web/JS", profile: "fast_noisy" },
];

// ---------------------------------------------------------------------------
// Project profiles. "health" drives whether throughput/quality trend down
// toward the deadline, producing realistic at-risk signals.
// ---------------------------------------------------------------------------
type Health = "healthy" | "at_risk";

const PROJECT_SEED: {
  name: string;
  domain: string;
  description: string;
  health: Health;
  /** How far through its timeline the project is "today", 0..1. */
  progressFraction: number;
}[] = [
  {
    name: "Code RLHF v2",
    domain: "Code RLHF",
    description: "Preference pairs over Python code completions for an RL reward model.",
    health: "healthy",
    progressFraction: 0.78,
  },
  {
    name: "Competition Math Traces",
    domain: "Math reasoning",
    description: "Step-by-step solution traces for olympiad-style problems.",
    health: "healthy",
    progressFraction: 0.62,
  },
  {
    name: "Agent Tool-Use Eval",
    domain: "Tool-use traces",
    description: "Multi-step tool-use trajectories with success/failure labels.",
    health: "at_risk",
    progressFraction: 0.85,
  },
  {
    name: "SQL Reasoning Set",
    domain: "SQL",
    description: "Natural-language-to-SQL with verified execution results.",
    health: "healthy",
    progressFraction: 0.55,
  },
  {
    name: "Web Agent Safety",
    domain: "Web/JS",
    description: "Browser-agent transcripts flagged for unsafe actions.",
    health: "at_risk",
    progressFraction: 0.9,
  },
];

/** Weekday weighting: weekends produce far fewer items. */
function dayVolumeMultiplier(date: Date) {
  const dow = date.getDay(); // 0 Sun .. 6 Sat
  if (dow === 0 || dow === 6) return 0.2;
  return 1;
}

/**
 * Throughput shape over the project's active window.
 * Healthy projects ramp up and hold; at-risk projects ramp then decay.
 */
function throughputShape(health: Health, t: number) {
  // t in [0,1] across the active window.
  const ramp = Math.min(1, t / 0.15); // first ~15% is ramp-up
  if (health === "healthy") return ramp * (0.9 + 0.2 * t); // gently rising
  // at-risk: rises early then falls off in the back half
  const decay = t < 0.5 ? 1 : 1 - (t - 0.5) * 1.4;
  return ramp * Math.max(0.25, decay);
}

/** Quality drift: at-risk projects see quality slip over time. */
function qualityDrift(health: Health, t: number) {
  return health === "healthy" ? 0.02 * t : -0.18 * t;
}

async function main() {
  console.log("Resetting tables...");
  await prisma.item.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.annotator.deleteMany();
  await prisma.project.deleteMany();

  console.log("Creating annotators...");
  const annotators = await Promise.all(
    ANNOTATOR_SEED.map((a, i) =>
      prisma.annotator.create({
        data: {
          name: a.name,
          email: `${a.name.toLowerCase().replace(/[^a-z]+/g, ".")}@vendor.example`,
          speciality: a.speciality,
          createdAt: subDays(START, randInt(1, 10)),
        },
      }).then((rec) => ({ ...rec, profile: ANNOTATOR_SEED[i].profile }))
    )
  );

  let totalItems = 0;

  for (const p of PROJECT_SEED) {
    // The project started `progressFraction` of the way through its timeline,
    // so "today" sits at that fraction and the deadline lies ahead.
    const startDate = subDays(TODAY, Math.round(HISTORY_DAYS * p.progressFraction));
    const elapsed = Math.max(1, differenceInCalendarDays(TODAY, startDate));
    const timelineLength = Math.max(elapsed + 5, Math.round(elapsed / p.progressFraction));
    const realDeadline = addDays(startDate, timelineLength);

    // Create with a placeholder target; the contracted target is calibrated
    // from realised throughput below so the pace label tells an honest story.
    const project = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        domain: p.domain,
        targetItemCount: 0,
        startDate,
        deadline: realDeadline,
        status: "ACTIVE",
      },
    });

    // Assign a working team, weighted by health: healthy projects are staffed
    // mostly with strong annotators (and at most one noisy), while at-risk
    // projects carry several noisy annotators — which, combined with quality
    // drift, drives their declining approval rate.
    const strong = shuffle(
      annotators.filter(
        (a) => a.profile === "fast_accurate" || a.profile === "slow_accurate"
      )
    );
    const mid = shuffle(annotators.filter((a) => a.profile === "average"));
    const noisy = shuffle(annotators.filter((a) => a.profile === "fast_noisy"));

    const workingTeam =
      p.health === "healthy"
        ? [...strong.slice(0, 3), ...mid.slice(0, 2), ...noisy.slice(0, 1)]
        : [...noisy.slice(0, 2), ...mid.slice(0, 2), ...strong.slice(0, 2)];

    const itemsData: {
      projectId: string;
      annotatorId: string;
      status: ItemStatus;
      qualityScore: number | null;
      createdAt: Date;
      reviewedAt: Date | null;
    }[] = [];

    const daysActive = Math.max(1, differenceInCalendarDays(TODAY, startDate));

    for (let d = 0; d <= daysActive; d++) {
      const date = addDays(startDate, d);
      if (date > TODAY) break;
      const t = d / daysActive; // 0..1 progress through active window
      const shape = throughputShape(p.health, t);
      const volMult = dayVolumeMultiplier(date) * shape;

      for (const member of workingTeam) {
        const cfg = PROFILE_CONFIG[member.profile];
        const base = randInt(cfg.dailyMin, cfg.dailyMax);
        const count = Math.round(base * volMult);
        for (let k = 0; k < count; k++) {
          // Spread items through the working day.
          const createdAt = new Date(date);
          createdAt.setHours(randInt(8, 19), randInt(0, 59), randInt(0, 59), 0);

          const meanQ = Math.min(
            1,
            Math.max(0, cfg.qualityMean + qualityDrift(p.health, t))
          );
          const score = clampedNormal(meanQ, cfg.qualitySpread);

          // Older items are reviewed; the most recent ~2 days may still be pending.
          const ageDays = differenceInCalendarDays(TODAY, date);
          let status: ItemStatus;
          let reviewedAt: Date | null = null;
          let qualityScore: number | null = null;

          if (ageDays >= 2 || rand() < 0.6) {
            reviewedAt = new Date(createdAt);
            reviewedAt.setDate(reviewedAt.getDate() + randInt(0, 2));
            if (reviewedAt > TODAY) reviewedAt = new Date(TODAY);
            qualityScore = Number(score.toFixed(3));
            status = qualityScore >= REJECT_THRESHOLD ? "APPROVED" : "REJECTED";
          } else {
            status = rand() < 0.5 ? "PENDING" : "IN_REVIEW";
          }

          itemsData.push({
            projectId: project.id,
            annotatorId: member.id,
            status,
            qualityScore,
            createdAt,
            reviewedAt,
          });
        }
      }
    }

    // Batch insert for speed.
    for (let i = 0; i < itemsData.length; i += 1000) {
      await prisma.item.createMany({ data: itemsData.slice(i, i + 1000) });
    }
    totalItems += itemsData.length;

    // Calibrate the contracted target from realised delivery so that
    // pace = (delivered/target) / timeFraction lands on TARGET_PACE.
    const delivered = itemsData.filter((i) => i.status === "APPROVED").length;
    const timeFraction = elapsed / timelineLength;
    const rawTarget = delivered / (TARGET_PACE[p.health] * timeFraction);
    // Round to a tidy contract number.
    const targetItemCount = Math.round(rawTarget / 50) * 50;

    await prisma.project.update({
      where: { id: project.id },
      data: { targetItemCount },
    });

    // Milestones: quarter checkpoints of the contracted target.
    const milestoneFractions = [0.25, 0.5, 0.75, 1];
    await prisma.milestone.createMany({
      data: milestoneFractions.map((f, idx) => ({
        projectId: project.id,
        name: `Checkpoint ${idx + 1} — ${Math.round(f * 100)}%`,
        targetDate: addDays(startDate, Math.round(timelineLength * f)),
        targetItemCount: Math.round(targetItemCount * f),
      })),
    });

    console.log(
      `  ${p.name.padEnd(26)} ${p.health.padEnd(8)} ${itemsData.length} items, ` +
        `target ${targetItemCount}, team ${workingTeam.length}, ` +
        `deadline ${realDeadline.toISOString().slice(0, 10)}`
    );
  }

  console.log(
    `\nSeed complete: ${PROJECT_SEED.length} projects, ${annotators.length} annotators, ${totalItems} items.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
