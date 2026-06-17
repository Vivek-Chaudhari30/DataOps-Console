import { NextResponse } from "next/server";
import { getGlobalMetrics } from "@/lib/metrics";
import { buildMetricsContext, generateSummary, MissingApiKeyError } from "@/lib/ai";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are an operations analyst for a data vendor that produces \
dataset-generation projects for AI labs. You write the daily status digest a \
delivery lead would read with their morning coffee.

Write a concise digest from the metrics provided. Cover:
- a one-line overall read of the portfolio,
- what's going well,
- what needs attention (name the specific projects and the numbers driving it),
- one or two recommended actions.

Ground every claim in the numbers given — do not invent figures. Keep it to a \
few short paragraphs or tight bullet points. Plain text, no headings, no preamble.`;

/** GET /api/ai/summary → natural-language daily digest of the current metrics. */
export async function GET() {
  try {
    const global = await getGlobalMetrics();
    const context = buildMetricsContext(global);

    const { text, model } = await generateSummary(
      SYSTEM_PROMPT,
      `Here are today's metrics as JSON:\n\n${JSON.stringify(
        context,
        null,
        2
      )}\n\nWrite the daily digest.`
    );

    return NextResponse.json({ summary: text, model, generatedAt: context.asOf });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("GET /api/ai/summary failed:", err);
    return NextResponse.json(
      { error: "Failed to generate the daily summary." },
      { status: 500 }
    );
  }
}
