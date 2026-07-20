import { describe, expect, it } from "vitest";
import { calendarByDay, equityCurve } from "./series";
import type { AnalyticsTrade } from "./types";

function trade(partial: Partial<AnalyticsTrade> & Pick<AnalyticsTrade, "netPnlPaise" | "closedAt">): AnalyticsTrade {
  return {
    grossPnlPaise: partial.netPnlPaise,
    chargesPaise: 0,
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

describe("equityCurve", () => {
  it("emits cumulative net + running drawdown per trade in close order", () => {
    const points = equityCurve([
      trade({ netPnlPaise: 4000, closedAt: "2025-01-04T00:00:00Z" }),
      trade({ netPnlPaise: 1000, closedAt: "2025-01-01T00:00:00Z" }),
      trade({ netPnlPaise: -3000, closedAt: "2025-01-02T00:00:00Z" }),
      trade({ netPnlPaise: -1000, closedAt: "2025-01-05T00:00:00Z" }),
      trade({ netPnlPaise: 500, closedAt: "2025-01-03T00:00:00Z" }),
    ]);
    expect(points.map((p) => p.cumulativeNetPaise)).toEqual([1000, -2000, -1500, 2500, 1500]);
    expect(points.map((p) => p.drawdownPaise)).toEqual([0, 3000, 2500, 0, 1000]);
  });

  it("is empty for no trades", () => {
    expect(equityCurve([])).toEqual([]);
  });
});

describe("calendarByDay", () => {
  it("aggregates net + win/loss counts per IST day, date-ascending", () => {
    const days = calendarByDay([
      trade({ netPnlPaise: 1000, closedAt: "2025-01-01T04:00:00Z" }),
      trade({ netPnlPaise: -400, closedAt: "2025-01-01T05:00:00Z" }),
      trade({ netPnlPaise: 200, closedAt: "2025-01-01T20:00:00Z" }), // → IST 2025-01-02
    ]);
    expect(days).toEqual([
      { date: "2025-01-01", netPnlPaise: 600, tradeCount: 2, wins: 1, losses: 1 },
      { date: "2025-01-02", netPnlPaise: 200, tradeCount: 1, wins: 1, losses: 0 },
    ]);
  });
});
