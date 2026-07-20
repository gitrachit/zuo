// Time series for the dashboard: the cumulative-net equity/drawdown curve and
// the per-IST-day calendar aggregation. Pure; integer paise.

import { istDate } from "./ist";
import type { AnalyticsTrade } from "./types";

export interface EquityPoint {
  closedAt: string; // UTC ISO of the trade closing at this point
  cumulativeNetPaise: number;
  /** running peak-to-here decline (>= 0) */
  drawdownPaise: number;
}

/**
 * Cumulative net-P&L curve ordered by closedAt (stable net tiebreak), one point
 * per trade, each carrying the running drawdown. Empty input → empty series.
 */
export function equityCurve(trades: AnalyticsTrade[]): EquityPoint[] {
  const ordered = [...trades].sort(
    (a, b) => a.closedAt.localeCompare(b.closedAt) || a.netPnlPaise - b.netPnlPaise,
  );
  const points: EquityPoint[] = [];
  let cumulative = 0;
  let peak = 0;
  for (const trade of ordered) {
    cumulative += trade.netPnlPaise;
    if (cumulative > peak) peak = cumulative;
    points.push({
      closedAt: trade.closedAt,
      cumulativeNetPaise: cumulative,
      drawdownPaise: peak - cumulative,
    });
  }
  return points;
}

export interface CalendarDay {
  date: string; // IST YYYY-MM-DD
  netPnlPaise: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

/** Net P&L and win/loss counts per IST trading day (by close), date-ascending. */
export function calendarByDay(trades: AnalyticsTrade[]): CalendarDay[] {
  const days = new Map<string, CalendarDay>();
  for (const trade of trades) {
    const date = istDate(trade.closedAt);
    const day =
      days.get(date) ?? { date, netPnlPaise: 0, tradeCount: 0, wins: 0, losses: 0 };
    day.netPnlPaise += trade.netPnlPaise;
    day.tradeCount += 1;
    if (trade.netPnlPaise > 0) day.wins += 1;
    else if (trade.netPnlPaise < 0) day.losses += 1;
    days.set(date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
