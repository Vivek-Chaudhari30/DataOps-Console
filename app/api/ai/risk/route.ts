import { NextResponse } from "next/server";
import { getGlobalMetrics } from "@/lib/metrics";
import { buildMetricsContext, generateRiskReport, MissingApiKeyError } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** GET /api/ai/risk → structured, validated at-risk project flags. */
export async function GET() {
  try {
    const global = await getGlobalMetrics();
    const context = buildMetricsContext(global);

    const { report, model } = await generateRiskReport(
      `Here are the current portfolio metrics as JSON:\n\n${JSON.stringify(
        context,
        null,
        2
      )}\n\nAnalyze them and report the at-risk projects.`
    );

    return NextResponse.json({ ...report, model, generatedAt: context.asOf });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("GET /api/ai/risk failed:", err);
    return NextResponse.json(
      { error: "Failed to generate risk flags." },
      { status: 500 }
    );
  }
}
