"use client";

import { useState } from "react";
import type { EquityPoint } from "@zuo/analytics";
import { formatIstDate, formatSignedINR } from "./format";

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 24, left: 16 };

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Equity curve (net)</div>
        <p className="mono mt-6 text-sm text-[var(--muted)]">
          Not enough closed, charge-known trades to plot yet.
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.cumulativeNetPaise);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - min) / range) * innerH;
  const zeroY = y(0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulativeNetPaise).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const finalUp = values[values.length - 1]! >= 0;
  const stroke = finalUp ? "var(--gain)" : "var(--loss)";

  const active = hover ?? points.length - 1;
  const activePoint = points[active]!;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Equity curve (cumulative net)</div>
        <div className="mono text-xs text-[var(--muted)]">
          {formatIstDate(activePoint.closedAt)} · {formatSignedINR(activePoint.cumulativeNetPaise)}
          {activePoint.drawdownPaise > 0 && (
            <span className="text-[var(--loss)]"> · dd -{formatSignedINR(activePoint.drawdownPaise).replace("+", "")}</span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Cumulative net P&L over closed trades"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth={1} />
        <path d={areaPath} fill={stroke} opacity={0.1} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        {hover !== null && (
          <>
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(active)} cy={y(activePoint.cumulativeNetPaise)} r={4} fill={stroke} stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
    </div>
  );
}
