/**
 * Read-back verification for the seed (milestone-1 gate).
 *
 * Prints, per project, the shape of the data the dashboard will visualise:
 *   - weekly produced-item counts (proves time-spread / throughput shape)
 *   - approval rate and average quality per week (proves quality trends)
 *   - delivered vs target and pace vs deadline (proves the burndown signal)
 *
 * If healthy projects look on-pace with flat/rising quality and at-risk ones
 * show decaying throughput + slipping quality, the seed is doing its job.
 */
import "dotenv/config";
import { differenceInCalendarDays } from "date-fns";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function weekKey(start: Date, d: Date) {
  return Math.floor(differenceInCalendarDays(d, start) / 7);
}

async function main() {
  const projects = await prisma.project.findMany({ orderBy: { name: "asc" } });

  for (const p of projects) {
    const items = await prisma.item.findMany({
      where: { projectId: p.id },
      select: { createdAt: true, status: true, qualityScore: true },
    });

    const delivered = items.filter((i) => i.status === "APPROVED").length;
    const reviewed = items.filter((i) => i.qualityScore !== null);
    const rejected = items.filter((i) => i.status === "REJECTED").length;
    const approvalRate = reviewed.length
      ? delivered / (delivered + rejected)
      : 0;

    // Bucket by week to show throughput + quality shape over time.
    const weeks = new Map<number, { count: number; q: number[] }>();
    for (const i of items) {
      const w = weekKey(p.startDate, i.createdAt);
      if (!weeks.has(w)) weeks.set(w, { count: 0, q: [] });
      const bucket = weeks.get(w)!;
      bucket.count++;
      if (i.qualityScore !== null) bucket.q.push(i.qualityScore);
    }

    const daysElapsed = Math.max(1, differenceInCalendarDays(new Date(), p.startDate));
    const totalDays = Math.max(1, differenceInCalendarDays(p.deadline, p.startDate));
    const timeFraction = daysElapsed / totalDays;
    const deliveryFraction = delivered / p.targetItemCount;
    const pace = deliveryFraction / timeFraction; // <1 means behind schedule

    console.log("\n" + "=".repeat(64));
    console.log(`${p.name}  [${p.domain}]`);
    console.log(
      `  delivered ${delivered}/${p.targetItemCount} (${(deliveryFraction * 100).toFixed(0)}%)  ` +
        `time elapsed ${(timeFraction * 100).toFixed(0)}%  ` +
        `pace ${pace.toFixed(2)}x ${pace < 0.9 ? "⚠ BEHIND" : "on track"}`
    );
    console.log(
      `  approval rate ${(approvalRate * 100).toFixed(1)}%  (rejected ${rejected})`
    );
    console.log("  week:  produced   avg-quality");
    for (const w of [...weeks.keys()].sort((a, b) => a - b)) {
      const b = weeks.get(w)!;
      const avgQ = b.q.length
        ? b.q.reduce((s, x) => s + x, 0) / b.q.length
        : NaN;
      const bar = "█".repeat(Math.round(b.count / 15));
      console.log(
        `   W${w}:  ${String(b.count).padStart(6)}   ` +
          `${isNaN(avgQ) ? "  n/a" : avgQ.toFixed(3)}  ${bar}`
      );
    }
  }

  console.log("\n" + "=".repeat(64));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
