import { describe, expect, it } from "vitest";
import { buildDashboardBundle, type DashboardTradeRow } from "./build-bundle";

function row(partial: Partial<DashboardTradeRow>): DashboardTradeRow {
  return {
    instrument_key: "GOLDM:2025-08-05",
    segment: "COMMODITY_FUT",
    product: "OTHER",
    direction: "LONG",
    opened_at: "2025-07-01T04:00:00Z",
    closed_at: "2025-07-01T06:00:00Z",
    quantity: 10,
    gross_pnl_paise: 10000,
    charges_paise: 2000,
    net_pnl_paise: 8000,
    setup_tag: null,
    session_bucket: null,
    is_expiry_day: false,
    hold_seconds: 7200,
    r_multiple: null,
    ...partial,
  };
}

describe("buildDashboardBundle — inclusion/exclusion", () => {
  it("includes only closed, charge-known trades in metrics", () => {
    const bundle = buildDashboardBundle([
      row({ net_pnl_paise: 8000 }),
      row({ closed_at: null, net_pnl_paise: null, gross_pnl_paise: null, charges_paise: null }), // open
      row({ closed_at: "2025-07-02T06:00:00Z", net_pnl_paise: null, gross_pnl_paise: null, charges_paise: null }), // uncovered era
    ]);
    expect(bundle.totalTrades).toBe(3);
    expect(bundle.includedTrades).toBe(1);
    expect(bundle.metrics.tradeCount).toBe(1);
    expect(bundle.metrics.netPnlPaise).toBe(8000);
    expect(bundle.excluded).toEqual({ openPositions: 1, chargesUnknown: 1 });
  });

  it("headline metrics equal analytics over the included trades", () => {
    const bundle = buildDashboardBundle([
      row({ net_pnl_paise: 8000, gross_pnl_paise: 10000, charges_paise: 2000, closed_at: "2025-07-01T06:00:00Z" }),
      row({ net_pnl_paise: -3000, gross_pnl_paise: -1000, charges_paise: 2000, closed_at: "2025-07-02T06:00:00Z" }),
    ]);
    expect(bundle.metrics.netPnlPaise).toBe(5000);
    expect(bundle.metrics.wins).toBe(1);
    expect(bundle.metrics.losses).toBe(1);
    expect(bundle.equityCurve.map((p) => p.cumulativeNetPaise)).toEqual([8000, 5000]);
    expect(bundle.calendar).toHaveLength(2);
  });

  it("provides every slice dimension", () => {
    const bundle = buildDashboardBundle([row({})]);
    expect(Object.keys(bundle.slices).sort()).toEqual(
      ["day_of_week", "direction", "expiry_day", "instrument", "product", "session_bucket", "setup"].sort(),
    );
    expect(bundle.slices.direction[0]!.key).toBe("LONG");
  });

  it("recentTrades includes open positions (net null) newest-first", () => {
    const bundle = buildDashboardBundle([
      row({ opened_at: "2025-07-01T04:00:00Z" }),
      row({ opened_at: "2025-07-05T04:00:00Z", closed_at: null, net_pnl_paise: null, gross_pnl_paise: null, charges_paise: null }),
    ]);
    expect(bundle.recentTrades[0]!.openedAt).toBe("2025-07-05T04:00:00Z");
    expect(bundle.recentTrades[0]!.netPnlPaise).toBeNull();
    expect(bundle.recentTrades).toHaveLength(2);
  });

  it("empty input yields a zeroed, non-crashing bundle", () => {
    const bundle = buildDashboardBundle([]);
    expect(bundle.metrics.tradeCount).toBe(0);
    expect(bundle.equityCurve).toEqual([]);
    expect(bundle.calendar).toEqual([]);
    expect(bundle.excluded).toEqual({ openPositions: 0, chargesUnknown: 0 });
  });
});
