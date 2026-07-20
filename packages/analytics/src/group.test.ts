import { describe, expect, it } from "vitest";
import { filterTrades, groupBy } from "./group";
import type { AnalyticsTrade } from "./types";

function trade(partial: Partial<AnalyticsTrade> & Pick<AnalyticsTrade, "netPnlPaise" | "closedAt">): AnalyticsTrade {
  return {
    grossPnlPaise: partial.netPnlPaise,
    chargesPaise: 0,
    holdSeconds: null,
    rMultiple: null,
    setupTag: null,
    instrumentKey: "NIFTY",
    segment: "OPT",
    product: "OTHER",
    direction: "LONG",
    sessionBucket: null,
    isExpiryDay: false,
    ...partial,
  };
}

describe("filterTrades", () => {
  const trades = [
    trade({ netPnlPaise: 100, closedAt: "2025-01-01T10:00:00Z", instrumentKey: "NIFTY", direction: "LONG", isExpiryDay: true }),
    trade({ netPnlPaise: 200, closedAt: "2025-02-15T10:00:00Z", instrumentKey: "BANKNIFTY", direction: "SHORT", isExpiryDay: false }),
    trade({ netPnlPaise: 300, closedAt: "2025-03-20T10:00:00Z", instrumentKey: "NIFTY", direction: "SHORT", isExpiryDay: false }),
  ];

  it("filters by inclusive IST date range", () => {
    const out = filterTrades(trades, { fromDate: "2025-02-01", toDate: "2025-03-01" });
    expect(out.map((t) => t.netPnlPaise)).toEqual([200]);
  });

  it("filters by instrument, direction and expiry flag", () => {
    expect(filterTrades(trades, { instrumentKey: "NIFTY" })).toHaveLength(2);
    expect(filterTrades(trades, { direction: "SHORT" })).toHaveLength(2);
    expect(filterTrades(trades, { expiryDay: true })).toHaveLength(1);
    expect(filterTrades(trades, { expiryDay: false })).toHaveLength(2);
  });

  it("combines predicates (AND)", () => {
    const out = filterTrades(trades, { instrumentKey: "NIFTY", direction: "SHORT" });
    expect(out.map((t) => t.netPnlPaise)).toEqual([300]);
  });
});

describe("groupBy", () => {
  const trades = [
    trade({ netPnlPaise: 500, closedAt: "2025-01-01T10:00:00Z", setupTag: "breakout" }),
    trade({ netPnlPaise: -200, closedAt: "2025-01-02T10:00:00Z", setupTag: "breakout" }),
    trade({ netPnlPaise: 1000, closedAt: "2025-01-03T10:00:00Z", setupTag: "reversal" }),
    trade({ netPnlPaise: -100, closedAt: "2025-01-04T10:00:00Z", setupTag: null }),
  ];

  it("groups by setup with per-bucket metrics, sorted by net desc", () => {
    const buckets = groupBy(trades, "setup");
    expect(buckets.map((b) => b.key)).toEqual(["reversal", "breakout", "untagged"]);
    const breakout = buckets.find((b) => b.key === "breakout")!;
    expect(breakout.metrics.tradeCount).toBe(2);
    expect(breakout.metrics.netPnlPaise).toBe(300);
    expect(breakout.metrics.winRate).toBeCloseTo(0.5, 10);
    expect(buckets.find((b) => b.key === "untagged")!.metrics.netPnlPaise).toBe(-100);
  });

  it("groups by expiry_day into expiry/non_expiry", () => {
    const buckets = groupBy(
      [
        trade({ netPnlPaise: 100, closedAt: "2025-01-01T10:00:00Z", isExpiryDay: true }),
        trade({ netPnlPaise: 50, closedAt: "2025-01-02T10:00:00Z", isExpiryDay: false }),
      ],
      "expiry_day",
    );
    expect(buckets.map((b) => b.key).sort()).toEqual(["expiry", "non_expiry"]);
  });

  it("groups by day_of_week keeping Sun..Sat order", () => {
    // 2025-01-01 Wed, 2025-01-02 Thu, 2024-12-29 Sun
    const buckets = groupBy(
      [
        trade({ netPnlPaise: 1, closedAt: "2025-01-01T10:00:00Z" }),
        trade({ netPnlPaise: 1, closedAt: "2025-01-02T10:00:00Z" }),
        trade({ netPnlPaise: 1, closedAt: "2024-12-29T10:00:00Z" }),
      ],
      "day_of_week",
    );
    expect(buckets.map((b) => b.key)).toEqual(["Sun", "Wed", "Thu"]);
  });

  it("session_bucket falls back to 'unknown'", () => {
    const buckets = groupBy(
      [trade({ netPnlPaise: 1, closedAt: "2025-01-01T10:00:00Z", sessionBucket: null })],
      "session_bucket",
    );
    expect(buckets[0]!.key).toBe("unknown");
  });
});
