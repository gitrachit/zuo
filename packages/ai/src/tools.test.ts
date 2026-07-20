import type { AnalyticsTrade } from "@zuo/analytics";
import { describe, expect, it } from "vitest";
import {
  executeGetDebriefInputs,
  executeListTrades,
  executeQueryMetrics,
  runTool,
  TOOL_DEFINITIONS,
} from "./tools";

function trade(partial: Partial<AnalyticsTrade> & Pick<AnalyticsTrade, "netPnlPaise" | "closedAt">): AnalyticsTrade {
  return {
    grossPnlPaise: partial.netPnlPaise + 2000,
    chargesPaise: 2000,
    holdSeconds: 3600,
    rMultiple: null,
    setupTag: null,
    instrumentKey: "GOLDM:2025-08-05",
    segment: "COMMODITY_FUT",
    product: "OTHER",
    direction: "LONG",
    sessionBucket: null,
    isExpiryDay: false,
    ...partial,
  };
}

const TRADES: AnalyticsTrade[] = [
  trade({ netPnlPaise: 10000, closedAt: "2025-07-01T05:00:00Z", direction: "LONG", setupTag: "breakout" }),
  trade({ netPnlPaise: -5000, closedAt: "2025-07-02T05:00:00Z", direction: "SHORT", setupTag: "breakout" }),
  trade({ netPnlPaise: 20000, closedAt: "2025-07-03T05:00:00Z", direction: "LONG", setupTag: "reversal", instrumentKey: "NIFTY" }),
];

describe("executeQueryMetrics — mirrors packages/analytics", () => {
  it("returns only the requested metrics, in paise", () => {
    const r = executeQueryMetrics(TRADES, { metric: ["net_pnl", "win_rate", "trade_count"] });
    expect(r.overall.net_pnl).toBe(25000);
    expect(r.overall.win_rate).toBeCloseTo(2 / 3, 10);
    expect(r.overall.trade_count).toBe(3);
    expect(r.unit).toBe("paise");
    expect(Object.keys(r.overall).sort()).toEqual(["net_pnl", "trade_count", "win_rate"]);
  });

  it("applies dateRange (IST inclusive)", () => {
    const r = executeQueryMetrics(TRADES, {
      metric: ["net_pnl"],
      dateRange: { fromDate: "2025-07-02", toDate: "2025-07-03" },
    });
    expect(r.tradeCount).toBe(2);
    expect(r.overall.net_pnl).toBe(15000);
  });

  it("groups by a dimension", () => {
    const r = executeQueryMetrics(TRADES, { metric: ["net_pnl"], groupBy: "setup" });
    const bySetup = Object.fromEntries((r.groups ?? []).map((g) => [g.key, g.metrics.net_pnl]));
    expect(bySetup).toEqual({ breakout: 5000, reversal: 20000 });
  });

  it("applies filters (direction)", () => {
    const r = executeQueryMetrics(TRADES, { metric: ["trade_count"], filters: { direction: "LONG" } });
    expect(r.overall.trade_count).toBe(2);
  });
});

describe("executeListTrades", () => {
  it("sorts and limits, returns paise citations", () => {
    const rows = executeListTrades(TRADES, { sort: "net_pnl_desc", limit: 2 });
    expect(rows.map((r) => r.netPnlPaise)).toEqual([20000, 10000]);
    expect(rows[0]!.instrumentKey).toBe("NIFTY");
  });

  it("clamps limit to [1,100]", () => {
    expect(executeListTrades(TRADES, { limit: 999 })).toHaveLength(3);
    expect(executeListTrades(TRADES, { limit: 0 })).toHaveLength(1);
  });
});

describe("executeGetDebriefInputs", () => {
  it("bundles one IST day's trades + full metrics", () => {
    const r = executeGetDebriefInputs(TRADES, { date: "2025-07-01" });
    expect(r.trades).toHaveLength(1);
    expect(r.metrics.net_pnl).toBe(10000);
    expect(r.metrics.trade_count).toBe(1);
  });
});

describe("runTool dispatcher + schemas", () => {
  it("dispatches by name", () => {
    const r = runTool("query_metrics", { metric: ["trade_count"] }, TRADES) as { overall: { trade_count: number } };
    expect(r.overall.trade_count).toBe(3);
  });

  it("exposes three tool definitions with strict schemas", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      "query_metrics",
      "list_trades",
      "get_debrief_inputs",
    ]);
    for (const def of TOOL_DEFINITIONS) {
      expect(def.input_schema.additionalProperties).toBe(false);
    }
  });
});
