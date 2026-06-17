import Anthropic from "@anthropic-ai/sdk";
import type { GlobalMetrics } from "@/lib/metrics";

/**
 * Anthropic client + helpers for the AI features.
 *
 * The API key and model are read from the environment and never hardcoded.
 * `MissingApiKeyError` lets the routes return a friendly 400 (rather than a
 * 500) when the key isn't configured, so the UI can prompt for it.
 */

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to .env to enable the AI features."
    );
    this.name = "MissingApiKeyError";
  }
}

export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  if (!cached) cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Compact, grounded snapshot of the portfolio for the model to reason over.
 * We pass the derived KPIs (not raw items) so the prompt stays small and the
 * AI's claims are anchored to the same numbers the dashboard shows.
 */
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
      // Deterministic signals from the metrics layer, for the model to corroborate.
      computedRiskReasons: p.riskReasons,
    })),
  };
}
