import { z } from "zod";

/**
 * Schemas shared between the AI risk endpoint and the client.
 *
 * The Anthropic risk endpoint forces tool-use with `riskReportJsonSchema`, then
 * validates the returned tool input against `riskReportSchema` (Zod) before
 * trusting it — so the flags are machine-usable even if the model drifts.
 */

export const severityEnum = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof severityEnum>;

export const riskFlagSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  severity: severityEnum,
  /** Concrete, data-grounded reasons this project is at risk. */
  reasons: z.array(z.string()).min(1),
  /** A single recommended action. */
  recommendation: z.string(),
});
export type RiskFlag = z.infer<typeof riskFlagSchema>;

export const riskReportSchema = z.object({
  /** One- or two-sentence portfolio-level read. */
  overallAssessment: z.string(),
  flags: z.array(riskFlagSchema),
});
export type RiskReport = z.infer<typeof riskReportSchema>;

/**
 * JSON schema for the Anthropic tool input. Kept in sync with riskReportSchema
 * above; `strict: true` on the tool makes Claude conform to it, and the Zod
 * parse is the belt-and-suspenders check.
 */
export const riskReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallAssessment: {
      type: "string",
      description:
        "A one- or two-sentence assessment of the overall portfolio health.",
    },
    flags: {
      type: "array",
      description:
        "Projects that are genuinely at risk. Omit healthy/on-track projects.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: { type: "string", description: "The project's id." },
          projectName: { type: "string", description: "The project's name." },
          severity: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "How urgent the risk is.",
          },
          reasons: {
            type: "array",
            items: { type: "string" },
            description:
              "Concrete reasons grounded in the metrics (pace, quality trend, approval rate).",
          },
          recommendation: {
            type: "string",
            description: "A single concrete action to address the risk.",
          },
        },
        required: [
          "projectId",
          "projectName",
          "severity",
          "reasons",
          "recommendation",
        ],
      },
    },
  },
  required: ["overallAssessment", "flags"],
} as const;
