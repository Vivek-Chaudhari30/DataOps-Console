import type { LeaderboardRow } from "@/lib/metrics";
import { num, pct, score } from "@/lib/format";

/** Annotator leaderboard, ranked (by delivered) upstream in the metrics layer. */
export function AnnotatorTable({
  rows,
  limit,
}: {
  rows: LeaderboardRow[];
  limit?: number;
}) {
  const data = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Annotator</th>
            <th className="py-2 pr-3 font-medium text-right">Delivered</th>
            <th className="py-2 pr-3 font-medium text-right">Approval</th>
            <th className="py-2 pr-3 font-medium text-right">Avg quality</th>
            <th className="py-2 font-medium text-right">Items/day</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const qualityTone =
              r.avgQuality === null
                ? "text-muted"
                : r.avgQuality >= 0.85
                  ? "text-ok"
                  : r.avgQuality >= 0.7
                    ? "text-foreground"
                    : "text-warn";
            return (
              <tr
                key={r.annotatorId}
                className="border-t border-border/60 hover:bg-surface-2/40"
              >
                <td className="py-2.5 pr-3 text-muted tabular-nums">{i + 1}</td>
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-foreground">{r.name}</div>
                  {r.speciality && (
                    <div className="text-xs text-muted">{r.speciality}</div>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {num(r.approved)}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {pct(r.approvalRate)}
                </td>
                <td
                  className={`py-2.5 pr-3 text-right tabular-nums ${qualityTone}`}
                >
                  {score(r.avgQuality)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted">
                  {r.itemsPerActiveDay}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
