/** Small display formatters shared across the dashboard. */

export const num = (x: number) => x.toLocaleString("en-US");

export const pct = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined ? "—" : `${(x * 100).toFixed(digits)}%`;

export const score = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined ? "—" : x.toFixed(digits);

export const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const dateFull = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** "in 5 days" / "3 days ago" / "today". */
export const relativeDays = (days: number) => {
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
};

export const HEALTH_LABEL: Record<string, string> = {
  on_track: "On track",
  watch: "Watch",
  at_risk: "At risk",
};

/** Shared chart palette (kept in sync with globals.css tokens). */
export const CHART = {
  accent: "#6366f1",
  ok: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
  sky: "#38bdf8",
  grid: "#232a38",
  axis: "#64748b",
  ideal: "#64748b",
  tooltipBg: "#161b27",
  tooltipBorder: "#2c3447",
} as const;
