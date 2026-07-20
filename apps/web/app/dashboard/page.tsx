import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchDashboardBundle } from "@/lib/dashboard/fetch";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { EquityCurve } from "./EquityCurve";
import { SliceTable } from "./SliceTable";
import { StatTiles } from "./StatTiles";
import { TradeList } from "./TradeList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const result = await fetchDashboardBundle();
  if (!result.ok) {
    if (result.reason === "not_signed_in") redirect("/login");
    if (result.reason === "not_configured") redirect("/");
    return (
      <main className="zuo-terminal min-h-screen p-8">
        <p className="mono text-sm text-[var(--loss)]">Couldn&apos;t load trades: {result.message}</p>
      </main>
    );
  }

  const { bundle } = result;
  const { excluded, totalTrades, includedTrades } = bundle;

  return (
    <main className="zuo-terminal min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <Link href="/import" className="mono text-sm text-[var(--muted)] hover:text-[var(--text)]">
            Import tradebook →
          </Link>
        </header>

        {totalTrades === 0 ? (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[var(--muted)]">
              No trades yet. <Link href="/import" className="text-[var(--gain)] underline">Import a tradebook</Link> to see your analytics.
            </p>
          </div>
        ) : (
          <>
            {(excluded.chargesUnknown > 0 || excluded.openPositions > 0) && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface2)] px-4 py-3 text-xs text-[var(--muted)]">
                Analytics computed over{" "}
                <span className="text-[var(--text)]">{includedTrades}</span> closed, charge-known trades.
                {excluded.openPositions > 0 && <> {excluded.openPositions} still open.</>}
                {excluded.chargesUnknown > 0 && (
                  <> {excluded.chargesUnknown} excluded — no charge-rate table covers their dates yet.</>
                )}
              </div>
            )}

            <StatTiles metrics={bundle.metrics} />
            <EquityCurve points={bundle.equityCurve} />
            <SliceTable slices={bundle.slices} />
            <CalendarHeatmap calendar={bundle.calendar} />
            <TradeList trades={bundle.recentTrades} />

            <p className="mono text-xs text-[var(--muted)]">
              Net P&amp;L is after estimated charges. Equity, drawdown and slices use net.
              Charges for imported trades are estimates (Console tradebooks omit MIS/CNC —
              equity days are inferred). Verified contract-note rates land per era as they&apos;re added.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
