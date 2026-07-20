import type { CalendarDay } from "@zuo/analytics";
import { formatSignedINR } from "./format";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface MonthGrid {
  label: string;
  year: number;
  month: number; // 0-11
  netPaise: number;
  days: Map<number, CalendarDay>;
}

function groupByMonth(calendar: CalendarDay[]): MonthGrid[] {
  const months = new Map<string, MonthGrid>();
  for (const day of calendar) {
    const [y, m, d] = day.date.split("-").map(Number) as [number, number, number];
    const key = `${y}-${m}`;
    const grid =
      months.get(key) ??
      ({
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
        year: y,
        month: m - 1,
        netPaise: 0,
        days: new Map<number, CalendarDay>(),
      } satisfies MonthGrid);
    grid.days.set(d, day);
    grid.netPaise += day.netPnlPaise;
    months.set(key, grid);
  }
  return [...months.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

function cellStyle(net: number, maxAbs: number): React.CSSProperties {
  if (net === 0) return { background: "var(--surface2)" };
  const intensity = 0.25 + 0.75 * (maxAbs ? Math.abs(net) / maxAbs : 0);
  return {
    background: net > 0 ? "var(--gain)" : "var(--loss)",
    opacity: intensity,
  };
}

export function CalendarHeatmap({ calendar }: { calendar: CalendarDay[] }) {
  if (calendar.length === 0) return null;
  const months = groupByMonth(calendar);
  const maxAbs = Math.max(...calendar.map((d) => Math.abs(d.netPnlPaise)), 1);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Calendar (net P&amp;L by IST day)</div>
      <div className="mt-3 flex flex-wrap gap-6">
        {months.map((grid) => {
          const firstWeekday = new Date(Date.UTC(grid.year, grid.month, 1)).getUTCDay();
          const daysInMonth = new Date(Date.UTC(grid.year, grid.month + 1, 0)).getUTCDate();
          const cells: (number | null)[] = [
            ...Array<null>(firstWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          return (
            <div key={`${grid.year}-${grid.month}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{grid.label}</span>
                <span className={`mono text-xs ${grid.netPaise >= 0 ? "text-[var(--gain)]" : "text-[var(--loss)]"}`}>
                  {formatSignedINR(grid.netPaise)}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-7 gap-[3px]">
                {WEEKDAY_LABELS.map((w, i) => (
                  <div key={i} className="text-center text-[10px] text-[var(--muted)]">{w}</div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`pad-${i}`} className="h-6 w-6" />;
                  const entry = grid.days.get(day);
                  return (
                    <div
                      key={day}
                      className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-[var(--text)]"
                      style={entry ? cellStyle(entry.netPnlPaise, maxAbs) : { background: "var(--surface2)" }}
                      title={
                        entry
                          ? `${entry.date}: ${formatSignedINR(entry.netPnlPaise)} · ${entry.tradeCount} trades (${entry.wins}W/${entry.losses}L)`
                          : undefined
                      }
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
