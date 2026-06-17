import { NextResponse } from "next/server";
import { getGlobalMetrics, getProjectMetrics } from "@/lib/metrics";

// Always read fresh from the database.
export const dynamic = "force-dynamic";

/**
 * GET /api/metrics            → global dashboard metrics (summary, projects,
 *                               aggregate throughput, leaderboard)
 * GET /api/metrics?projectId= → full metric bundle for one project
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  try {
    if (projectId) {
      const metrics = await getProjectMetrics(projectId);
      if (!metrics) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(metrics);
    }

    const metrics = await getGlobalMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("GET /api/metrics failed:", err);
    return NextResponse.json(
      { error: "Failed to compute metrics" },
      { status: 500 }
    );
  }
}
