import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { GlobalMetrics } from "@/lib/metrics";
import {
  riskReportJsonSchema,
  riskReportSchema,
  type RiskReport,
} from "@/lib/validation";

/**
 * Provider-agnostic AI layer for the dashboard's two AI features.
 *
 * The provider is chosen from whichever key is present (override with
 * AI_PROVIDER). Structured risk flags use OpenAI structured outputs
 * (json_schema, strict) or Anthropic forced tool-use — both validated against
 * the same Zod schema, with a retry loop. Keys and models come from env and are
 * never hardcoded.
 */

export type Provider = "openai" | "anthropic";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No AI provider key set. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env to enable the AI features."
    );
    this.name = "MissingApiKeyError";
  }
}

const DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
};

function resolveProvider(): { provider: Provider; model: string } {
  const explicit = process.env.AI_PROVIDER as Provider | undefined;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

  let provider: Provider | null = null;
  if (explicit === "openai" && hasOpenAI) provider = "openai";
  else if (explicit === "anthropic" && hasAnthropic) provider = "anthropic";
  else if (!explicit && hasOpenAI) provider = "openai";
  else if (!explicit && hasAnthropic) provider = "anthropic";

  if (!provider) throw new MissingApiKeyError();

  const envModel =
    provider === "openai" ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL;
  return { provider, model: envModel || DEFAULT_MODEL[provider] };
}

const MAX_ATTEMPTS = 3;

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAI() {
  if (!openaiClient)
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}
function getAnthropic() {
  if (!anthropicClient)
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

/** True for client errors that won't succeed on retry. */
function isNonRetryable(err: unknown): boolean {
  return (
    err instanceof OpenAI.AuthenticationError ||
    err instanceof OpenAI.PermissionDeniedError ||
    err instanceof OpenAI.BadRequestError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.BadRequestError
  );
}

// ---------------------------------------------------------------------------
// Metrics context — a compact, grounded snapshot for the model to reason over.
// We pass derived KPIs (not raw items) so the prompt stays small and the AI's
// claims are anchored to the same numbers the dashboard shows.
// ---------------------------------------------------------------------------
export function buildMetricsContext(global: GlobalMetrics) {
  return {
    asOf: new Date().toISOString(),
    portfolio: {
      activeProjects: global.summary.activeProjects,
      totalDelivered: global.summary.totalDelivered,
      totalProduced: global.summary.totalProduced,
      overallApprovalRate: global.summary.overallApprovalRate,
      atRiskCount: global.summary.atRiskCount,
    },
    projects: global.projects.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      health: p.health,
      delivered: p.delivered,
      target: p.target,
      deliveryFraction: p.deliveryFraction,
      timeElapsedFraction: p.timeFraction,
      paceRatio: p.paceRatio,
      daysRemaining: p.daysRemaining,
      recentApprovalRate: p.approvalRateRecent,
      recentAvgQuality: p.avgQualityRecent,
      qualityDelta: p.qualityDelta,
      computedRiskReasons: p.riskReasons,
    })),
  };
}

// ---------------------------------------------------------------------------
// Daily summary (free-form natural language)
// ---------------------------------------------------------------------------
export async function generateSummary(
  system: string,
  user: string
): Promise<{ text: string; model: string; provider: Provider }> {
  const { provider, model } = resolveProvider();

  if (provider === "openai") {
    const res = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return {
      text: res.choices[0]?.message?.content?.trim() ?? "",
      model,
      provider,
    };
  }

  const message = await getAnthropic().messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  return { text, model, provider };
}

// ---------------------------------------------------------------------------
// Structured risk flags (schema-constrained + validated + retried)
// ---------------------------------------------------------------------------
async function callOpenAIRisk(model: string, user: string): Promise<unknown> {
  const res = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: "system", content: RISK_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "risk_report",
        schema: riskReportJsonSchema as Record<string, unknown>,
        strict: true,
      },
    },
  });
  const choice = res.choices[0];
  if (choice?.message?.refusal) {
    throw new Error(`Model refused: ${choice.message.refusal}`);
  }
  const content = choice?.message?.content;
  if (!content) throw new Error("OpenAI returned no content.");
  return JSON.parse(content);
}

async function callAnthropicRisk(model: string, user: string): Promise<unknown> {
  const message = await getAnthropic().messages.create({
    model,
    max_tokens: 1500,
    system: RISK_SYSTEM_PROMPT,
    tools: [
      {
        name: "report_risk_flags",
        description:
          "Report the projects that are at risk, with grounded reasons and a recommendation each.",
        input_schema:
          riskReportJsonSchema as unknown as Anthropic.Tool.InputSchema,
        strict: true,
      } as Anthropic.Tool,
    ],
    tool_choice: { type: "tool", name: "report_risk_flags" },
    messages: [{ role: "user", content: user }],
  });
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block.");
  }
  return toolUse.input;
}

export async function generateRiskReport(
  user: string
): Promise<{ report: RiskReport; model: string; provider: Provider }> {
  const { provider, model } = resolveProvider();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw =
        provider === "openai"
          ? await callOpenAIRisk(model, user)
          : await callAnthropicRisk(model, user);
      // Validate — this is what makes the flags machine-usable regardless of provider.
      const report = riskReportSchema.parse(raw);
      return { report, model, provider };
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err)) throw err;
      // Retry on validation errors, transient API errors, refusals, missing blocks.
    }
  }
  throw lastError ?? new Error("Failed to generate risk report.");
}

export const RISK_SYSTEM_PROMPT = `You are a delivery risk analyst for a data vendor running \
dataset-generation projects for AI labs. You identify projects that are trending \
at-risk so a delivery lead can intervene early.

A project is at-risk when the metrics show it is falling behind or degrading:
- behind schedule (paceRatio well under 1.0 — delivered share lags time elapsed),
- declining quality (negative qualityDelta, or recent average quality dropping),
- an elevated rejection rate (low recentApprovalRate).

Only flag projects that are genuinely at risk — omit healthy, on-track projects. \
Ground every reason in the specific numbers provided. Set severity by how urgent \
intervention is.`;
