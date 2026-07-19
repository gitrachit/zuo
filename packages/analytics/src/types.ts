// Analytics input model. A minimal, charges-aware projection of a Trade —
// analytics never touches raw executions and never recomputes charges.
// Only CLOSED trades with a known net P&L are valid input; the caller filters
// (open positions and uncovered-charge-era trades are excluded upstream and
// counted separately, so aggregates are never silently wrong).

import type { Product, Segment, SessionBucket } from "@zuo/types";

export interface AnalyticsTrade {
  netPnlPaise: number; // charges-aware — the primary figure for every metric
  grossPnlPaise: number;
  chargesPaise: number;
  closedAt: string; // UTC ISO — equity-curve / drawdown ordering key
  holdSeconds: number | null;
  rMultiple: number | null; // null unless user set risk; never guessed
  // slicing dimensions (used from PR B on):
  setupTag: string | null;
  instrumentKey: string;
  segment: Segment;
  product: Product;
  direction: "LONG" | "SHORT";
  sessionBucket: SessionBucket | null;
  isExpiryDay: boolean;
}

export interface Metrics {
  tradeCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** wins / tradeCount, 0..1; 0 when there are no trades */
  winRate: number;
  netPnlPaise: number;
  grossPnlPaise: number;
  chargesPaise: number;
  /** mean net P&L of winning trades; null if none */
  avgWinPaise: number | null;
  /** mean net P&L of losing trades (negative); null if none */
  avgLossPaise: number | null;
  largestWinPaise: number | null;
  largestLossPaise: number | null;
  /** gross profit / |gross loss| on net figures; null if no losing trades */
  profitFactor: number | null;
  /** mean net P&L per trade (paise); 0 when there are no trades */
  expectancyPaise: number;
  /** mean R across trades that carry an R multiple; null if none do */
  expectancyR: number | null;
  /** worst peak-to-trough decline on the cumulative net equity curve (paise, >=0) */
  maxDrawdownPaise: number;
  /** mean hold across trades that carry a hold time; null if none do */
  avgHoldSeconds: number | null;
}
