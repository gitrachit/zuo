import { describe, expect, it } from "vitest";
import { computeMetrics, maxDrawdownPaise } from "./metrics";
import type { AnalyticsTrade } from "./types";

function trade(partial: Partial<AnalyticsTrade> & Pick<AnalyticsTrade, "netPnlPaise" | "closedAt">): AnalyticsTrade {
  return {
    grossPnlPaise: partial.netPnlPaise + 2000, // default: ₹20 charges
    chargesPaise: 2000,
    holdSeconds: null,
    rMultiple: null,
    setupTag: null,
    instrumentKey: "X",
    segment: "COMMODITY_FUT",
    product: "OTHER",
    direction: "LONG",
    sessionBucket: null,
    isExpiryDay: false,
    ...partial,
  };
}

// Hand-computed fixture: 2 wins, 2 losses, 1 breakeven.
const FIXTURE: AnalyticsTrade[] = [
  trade({ netPnlPaise: 10000, grossPnlPaise: 12000, closedAt: "2025-01-01T00:00:00Z", holdSeconds: 3600, rMultiple: 2 }),
  trade({ netPnlPaise: -5000, grossPnlPaise: -3000, closedAt: "2025-01-02T00:00:00Z", holdSeconds: 7200, rMultiple: -1 }),
  trade({ netPnlPaise: 20000, grossPnlPaise: 22000, closedAt: "2025-01-03T00:00:00Z", holdSeconds: null, rMultiple: 4 }),
  trade({ netPnlPaise: -15000, grossPnlPaise: -13000, closedAt: "2025-01-04T00:00:00Z", holdSeconds: 1800, rMultiple: null }),
  trade({ netPnlPaise: 0, grossPnlPaise: 2000, closedAt: "2025-01-05T00:00:00Z", holdSeconds: 900, rMultiple: 0 }),
];

describe("computeMetrics — hand-computed fixture", () => {
  const m = computeMetrics(FIXTURE);

  it("counts and win rate", () => {
    expect(m.tradeCount).toBe(5);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(2);
    expect(m.breakevens).toBe(1);
    expect(m.winRate).toBeCloseTo(0.4, 10);
  });

  it("P&L totals (net primary, gross + charges secondary)", () => {
    expect(m.netPnlPaise).toBe(10000);
    expect(m.grossPnlPaise).toBe(20000);
    expect(m.chargesPaise).toBe(10000);
  });

  it("averages and extremes", () => {
    expect(m.avgWinPaise).toBe(15000); // (10000+20000)/2
    expect(m.avgLossPaise).toBe(-10000); // (-5000-15000)/2
    expect(m.largestWinPaise).toBe(20000);
    expect(m.largestLossPaise).toBe(-15000);
  });

  it("profit factor, expectancy, R, drawdown, hold", () => {
    expect(m.profitFactor).toBeCloseTo(1.5, 10); // 30000 / 20000
    expect(m.expectancyPaise).toBe(2000); // 10000 / 5
    expect(m.expectancyR).toBeCloseTo(1.25, 10); // (2-1+4+0)/4
    expect(m.maxDrawdownPaise).toBe(15000); // peak 25000 → trough 10000
    expect(m.avgHoldSeconds).toBe(3375); // (3600+7200+1800+900)/4
  });
});

describe("computeMetrics — edge cases", () => {
  it("empty input yields zeroed metrics with null ratios", () => {
    const m = computeMetrics([]);
    expect(m.tradeCount).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.netPnlPaise).toBe(0);
    expect(m.profitFactor).toBeNull();
    expect(m.expectancyR).toBeNull();
    expect(m.avgWinPaise).toBeNull();
    expect(m.maxDrawdownPaise).toBe(0);
  });

  it("all winners → profit factor null (no losses), drawdown 0", () => {
    const m = computeMetrics([
      trade({ netPnlPaise: 1000, closedAt: "2025-02-01T00:00:00Z" }),
      trade({ netPnlPaise: 2000, closedAt: "2025-02-02T00:00:00Z" }),
    ]);
    expect(m.profitFactor).toBeNull();
    expect(m.avgLossPaise).toBeNull();
    expect(m.largestLossPaise).toBeNull();
    expect(m.maxDrawdownPaise).toBe(0);
    expect(m.winRate).toBe(1);
  });

  it("no R multiples → expectancyR null; no holds → avgHold null", () => {
    const m = computeMetrics([
      trade({ netPnlPaise: 500, closedAt: "2025-03-01T00:00:00Z" }),
    ]);
    expect(m.expectancyR).toBeNull();
    expect(m.avgHoldSeconds).toBeNull();
  });
});

describe("maxDrawdownPaise", () => {
  it("is zero for a monotonically rising curve", () => {
    expect(
      maxDrawdownPaise([
        trade({ netPnlPaise: 100, closedAt: "2025-01-01T00:00:00Z" }),
        trade({ netPnlPaise: 200, closedAt: "2025-01-02T00:00:00Z" }),
      ]),
    ).toBe(0);
  });

  it("measures the deepest peak-to-trough, not the last", () => {
    // curve: +1000 (peak 1000) → -3000 (cum -2000, dd 3000) → +500 (cum -1500)
    //        → +4000 (peak 2500) → -1000 (cum 1500, dd 1000). max dd = 3000
    const trades = [
      trade({ netPnlPaise: 1000, closedAt: "2025-01-01T00:00:00Z" }),
      trade({ netPnlPaise: -3000, closedAt: "2025-01-02T00:00:00Z" }),
      trade({ netPnlPaise: 500, closedAt: "2025-01-03T00:00:00Z" }),
      trade({ netPnlPaise: 4000, closedAt: "2025-01-04T00:00:00Z" }),
      trade({ netPnlPaise: -1000, closedAt: "2025-01-05T00:00:00Z" }),
    ];
    expect(maxDrawdownPaise(trades)).toBe(3000);
  });

  it("orders by closedAt regardless of input order", () => {
    const shuffled = [
      trade({ netPnlPaise: -1000, closedAt: "2025-01-05T00:00:00Z" }),
      trade({ netPnlPaise: 4000, closedAt: "2025-01-04T00:00:00Z" }),
      trade({ netPnlPaise: -3000, closedAt: "2025-01-02T00:00:00Z" }),
      trade({ netPnlPaise: 500, closedAt: "2025-01-03T00:00:00Z" }),
      trade({ netPnlPaise: 1000, closedAt: "2025-01-01T00:00:00Z" }),
    ];
    expect(maxDrawdownPaise(shuffled)).toBe(3000);
  });
});
