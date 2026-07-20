import type { Metrics } from "@zuo/analytics";
import { formatDuration, formatINR, formatPct, formatRatio, formatSignedINR, pnlClass } from "./format";

function Tile({
  label,
  value,
  valueClass = "text-[var(--text)]",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mono mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mono mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function StatTiles({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {/* Net P&L is the primary number (product rule #2) — spans two on mobile */}
      <div className="col-span-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 md:col-span-2">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Net P&L (after charges)</div>
        <div className={`mono mt-1 text-4xl font-semibold ${pnlClass(metrics.netPnlPaise)}`}>
          {formatSignedINR(metrics.netPnlPaise)}
        </div>
        <div className="mono mt-1 text-xs text-[var(--muted)]">
          gross {formatINR(metrics.grossPnlPaise)} · charges {formatINR(metrics.chargesPaise)}
        </div>
      </div>
      <Tile label="Win rate" value={formatPct(metrics.winRate)} sub={`${metrics.wins}W / ${metrics.losses}L / ${metrics.breakevens}BE`} />
      <Tile label="Profit factor" value={formatRatio(metrics.profitFactor)} />
      <Tile label="Expectancy / trade" value={formatSignedINR(metrics.expectancyPaise)} valueClass={pnlClass(metrics.expectancyPaise)} />
      <Tile label="Max drawdown" value={metrics.maxDrawdownPaise ? `-${formatINR(metrics.maxDrawdownPaise)}` : formatINR(0)} valueClass="text-[var(--loss)]" />
      <Tile label="Avg win" value={formatSignedINR(metrics.avgWinPaise)} valueClass="text-[var(--gain)]" />
      <Tile label="Avg loss" value={formatSignedINR(metrics.avgLossPaise)} valueClass="text-[var(--loss)]" />
      <Tile label="Trades" value={String(metrics.tradeCount)} sub={metrics.expectancyR !== null ? `avg ${formatRatio(metrics.expectancyR)}R` : undefined} />
      <Tile label="Avg hold" value={formatDuration(metrics.avgHoldSeconds)} />
    </div>
  );
}
