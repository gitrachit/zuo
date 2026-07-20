"use client";

import { useState } from "react";
import type { GroupDimension, MetricsBucket } from "@zuo/analytics";
import { formatPct, formatSignedINR, pnlClass } from "./format";

const DIMENSION_LABELS: Record<GroupDimension, string> = {
  instrument: "Instrument",
  setup: "Setup",
  direction: "Direction",
  session_bucket: "Session",
  day_of_week: "Day of week",
  expiry_day: "Expiry day",
  product: "Product",
};

const ORDER: GroupDimension[] = [
  "instrument",
  "direction",
  "day_of_week",
  "session_bucket",
  "expiry_day",
  "setup",
  "product",
];

export function SliceTable({ slices }: { slices: Record<GroupDimension, MetricsBucket[]> }) {
  const [dimension, setDimension] = useState<GroupDimension>("instrument");
  const buckets = slices[dimension] ?? [];
  const maxAbs = Math.max(...buckets.map((b) => Math.abs(b.metrics.netPnlPaise)), 1);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Breakdown by</span>
        {ORDER.map((dim) => (
          <button
            key={dim}
            onClick={() => setDimension(dim)}
            className={`rounded px-2 py-1 text-xs ${
              dim === dimension
                ? "bg-[var(--line)] text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {DIMENSION_LABELS[dim]}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="mono w-full text-sm">
          <thead className="text-xs text-[var(--muted)]">
            <tr>
              <th className="py-1 pr-4 text-left font-normal">{DIMENSION_LABELS[dimension]}</th>
              <th className="py-1 pr-4 text-right font-normal">Net P&amp;L</th>
              <th className="py-1 pr-4 text-right font-normal">Trades</th>
              <th className="py-1 pr-4 text-right font-normal">Win %</th>
              <th className="w-24 py-1 text-left font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.key} className="border-t border-[var(--line)]">
                <td className="py-1 pr-4">{b.key}</td>
                <td className={`py-1 pr-4 text-right ${pnlClass(b.metrics.netPnlPaise)}`}>
                  {formatSignedINR(b.metrics.netPnlPaise)}
                </td>
                <td className="py-1 pr-4 text-right text-[var(--muted)]">{b.metrics.tradeCount}</td>
                <td className="py-1 pr-4 text-right text-[var(--muted)]">{formatPct(b.metrics.winRate)}</td>
                <td className="py-1">
                  <div className="h-2 w-24 rounded-full bg-[var(--surface2)]">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${(Math.abs(b.metrics.netPnlPaise) / maxAbs) * 100}%`,
                        background: b.metrics.netPnlPaise >= 0 ? "var(--gain)" : "var(--loss)",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {buckets.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-[var(--muted)]">
                  No charge-known trades to slice yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
