import type { RecentTrade } from "@/lib/dashboard/build-bundle";
import { formatINR, formatIstDateTime, formatSignedINR, pnlClass } from "./format";

export function TradeList({ trades }: { trades: RecentTrade[] }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Recent trades</div>
      <div className="mt-3 overflow-x-auto">
        <table className="mono w-full text-sm">
          <thead className="text-xs text-[var(--muted)]">
            <tr>
              <th className="py-1 pr-4 text-left font-normal">Instrument</th>
              <th className="py-1 pr-4 text-left font-normal">Dir</th>
              <th className="py-1 pr-4 text-right font-normal">Qty</th>
              <th className="py-1 pr-4 text-left font-normal">Opened (IST)</th>
              <th className="py-1 pr-4 text-left font-normal">Status</th>
              <th className="py-1 pr-4 text-right font-normal">Net P&amp;L</th>
              <th className="py-1 pr-4 text-right font-normal">Charges</th>
              <th className="py-1 text-right font-normal">Gross</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i} className="border-t border-[var(--line)]">
                <td className="py-1 pr-4">{t.instrumentKey}</td>
                <td className="py-1 pr-4 text-[var(--muted)]">{t.direction}</td>
                <td className="py-1 pr-4 text-right text-[var(--muted)]">{t.quantity}</td>
                <td className="py-1 pr-4">{formatIstDateTime(t.openedAt)}</td>
                <td className="py-1 pr-4 text-[var(--muted)]">{t.closedAt ? "closed" : "open"}</td>
                <td className={`py-1 pr-4 text-right font-medium ${pnlClass(t.netPnlPaise)}`}>
                  {formatSignedINR(t.netPnlPaise)}
                </td>
                <td className="py-1 pr-4 text-right text-[var(--muted)]">{formatINR(t.chargesPaise)}</td>
                <td className="py-1 text-right text-[var(--muted)]">{formatINR(t.grossPnlPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
