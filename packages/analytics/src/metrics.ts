// Deterministic metrics over closed, charges-known trades. Pure integer paise;
// ratios are numbers or null. This is the single source of every dashboard and
// copilot number (CLAUDE.md rule #1).

import type { AnalyticsTrade, Metrics } from "./types";

const EMPTY_METRICS: Metrics = {
  tradeCount: 0,
  wins: 0,
  losses: 0,
  breakevens: 0,
  winRate: 0,
  netPnlPaise: 0,
  grossPnlPaise: 0,
  chargesPaise: 0,
  avgWinPaise: null,
  avgLossPaise: null,
  largestWinPaise: null,
  largestLossPaise: null,
  profitFactor: null,
  expectancyPaise: 0,
  expectancyR: null,
  maxDrawdownPaise: 0,
  avgHoldSeconds: null,
};

/** Integer mean (banker-free, round half away from zero) of paise values. */
function meanPaise(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

/**
 * Max peak-to-trough drawdown on the cumulative net-P&L curve, ordered by
 * closedAt (then a stable tiebreak). Returns a non-negative paise magnitude.
 */
export function maxDrawdownPaise(trades: AnalyticsTrade[]): number {
  const ordered = [...trades].sort(
    (a, b) => a.closedAt.localeCompare(b.closedAt) || a.netPnlPaise - b.netPnlPaise,
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of ordered) {
    cumulative += trade.netPnlPaise;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

export function computeMetrics(trades: AnalyticsTrade[]): Metrics {
  if (trades.length === 0) return { ...EMPTY_METRICS };

  const winning = trades.filter((t) => t.netPnlPaise > 0);
  const losing = trades.filter((t) => t.netPnlPaise < 0);
  const breakevens = trades.length - winning.length - losing.length;

  const netPnlPaise = trades.reduce((s, t) => s + t.netPnlPaise, 0);
  const grossPnlPaise = trades.reduce((s, t) => s + t.grossPnlPaise, 0);
  const chargesPaise = trades.reduce((s, t) => s + t.chargesPaise, 0);

  const grossProfit = winning.reduce((s, t) => s + t.netPnlPaise, 0);
  const grossLoss = losing.reduce((s, t) => s + t.netPnlPaise, 0); // <= 0

  const rMultiples = trades
    .map((t) => t.rMultiple)
    .filter((r): r is number => r !== null);
  const holds = trades
    .map((t) => t.holdSeconds)
    .filter((h): h is number => h !== null);

  return {
    tradeCount: trades.length,
    wins: winning.length,
    losses: losing.length,
    breakevens,
    winRate: winning.length / trades.length,
    netPnlPaise,
    grossPnlPaise,
    chargesPaise,
    avgWinPaise: meanPaise(winning.map((t) => t.netPnlPaise)),
    avgLossPaise: meanPaise(losing.map((t) => t.netPnlPaise)),
    largestWinPaise: winning.length ? Math.max(...winning.map((t) => t.netPnlPaise)) : null,
    largestLossPaise: losing.length ? Math.min(...losing.map((t) => t.netPnlPaise)) : null,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    expectancyPaise: Math.round(netPnlPaise / trades.length),
    expectancyR: rMultiples.length
      ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length
      : null,
    maxDrawdownPaise: maxDrawdownPaise(trades),
    avgHoldSeconds: holds.length
      ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length)
      : null,
  };
}
