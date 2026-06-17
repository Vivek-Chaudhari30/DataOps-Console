import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getGlobalMetrics } from "@/lib/metrics";
import {
  ANTHROPIC_MODEL,
  buildMetricsContext,
  getAnthropic,
  MissingApiKeyError,
} from "@/lib/anthropic";
import {
  riskReportJsonSchema,
  riskReportSchema,
  type RiskReport,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a delivery risk analyst for a data vendor running \
dataset-generation projects for AI labs. You identify projects that are trending \
at-risk so a delivery lead can intervene early.

A project is at-risk when the metrics show it is falling behind or degrading:
- behind schedule (paceRatio well under 1.0 — delivered share lags time elapsed),
- declining quality (negative qualityDelta, or recent average quality dropping),
- an elevated rejection rate (low recentApprovalRate).

Only flag projects that are genuinely at risk — omit healthy, on-track projects. \
Ground every reason in the specific numbers provided. Set severity by how urgent \
intervention is. Always call the report_risk_flags tool with your findings.`;

/**
 * Calls Claude with forced tool-use to get structured risk flags, validates the
 * tool input with Zod, and retries on transient/validation failures. Auth and
 * bad-request errors are not retried.
 */
async function generateRiskReport(contextJson: string): Promise<RiskReport> {
  const client = getAnthropic();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: "report_risk_flags",
            description:
              "Report the projects that are at risk, with grounded reasons and a recommendation each.",
            input_schema:
              riskReportJsonSchema as unknown as Anthropic.Tool.InputSchema,
            // Strict mode makes Claude conform to the schema; we still validate.
            strict: true,
          } as Anthropic.Tool,
        ],
        tool_choice: { type: "tool", name: "report_risk_flags" },
        messages: [
          {
            role: "user",
            content: `Here are the current portfolio metrics as JSON:\n\n${contextJson}\n\nAnalyze them and report the at-risk projects.`,
          },
        ],
      });

      const toolUse = message.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return a tool_use block.");
      }

      // Validate the tool input — this is what makes the flags machine-usable.
      return riskReportSchema.parse(toolUse.input);
    } catch (err) {
      lastError = err;
      // Don't retry non-transient client errors.
      if (
        err instanceof Anthropic.AuthenticationError ||
        err instanceof Anthropic.PermissionDeniedError ||
        err instanceof Anthropic.BadRequestError
      ) {
        throw err;
      }
      // Otherwise (validation error, transient API error, missing tool block) retry.
    }
  }

  throw lastError ?? new Error("Failed to generate risk report.");
}

/** GET /api/ai/risk → structured, validated at-risk project flags. */
export async function GET() {
  try {
    const global = await getGlobalMetrics();
    const context = buildMetricsContext(global);
    const report = await generateRiskReport(JSON.stringify(context, null, 2));

    return NextResponse.json({
      ...report,
      model: ANTHROPIC_MODEL,
      generatedAt: context.asOf,
    });
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
