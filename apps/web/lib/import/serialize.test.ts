import type { ExecutionDraft, TradeDraft } from "@zuo/importer";
import { describe, expect, it } from "vitest";
import { executionRowFromDraft, matchableFromRow, tradeRowFromDraft } from "./serialize";

const draft: ExecutionDraft = {
  source: "zerodha_csv",
  brokerTradeId: "T001",
  brokerOrderId: "O001",
  symbol: "NIFTY2570325000CE",
  exchange: "NFO",
  segment: "OPT",
  product: "OTHER",
  side: "BUY",
  quantity: 75,
  pricePaise: 12050,
  executedAt: "2025-07-03T03:45:32.000Z",
  underlying: "NIFTY",
  expiry: "2025-07-03",
  strikePaise: 2500000,
  optionType: "CE",
  raw: { symbol: "NIFTY2570325000CE" },
};

describe("execution row mapping", () => {
  it("round-trips draft → row → matchable", () => {
    const row = executionRowFromDraft(draft, "user-1", "acct-1");
    expect(row).toMatchObject({
      user_id: "user-1",
      broker_account_id: "acct-1",
      broker_trade_id: "T001",
      price_paise: 12050,
      strike_paise: 2500000,
      option_type: "CE",
    });
    const matchable = matchableFromRow({ ...row, id: "e-1" });
    expect(matchable).toMatchObject({
      id: "e-1",
      symbol: draft.symbol,
      pricePaise: 12050,
      executedAt: draft.executedAt,
      underlying: "NIFTY",
      optionType: "CE",
    });
  });

  it("nullifies absent derivative fields", () => {
    const eq: ExecutionDraft = { ...draft, underlying: undefined, expiry: undefined, strikePaise: undefined, optionType: undefined };
    const row = executionRowFromDraft(eq, "u", "a");
    expect(row.underlying).toBeNull();
    expect(row.strike_paise).toBeNull();
    expect(matchableFromRow({ ...row, id: "x" }).underlying).toBeUndefined();
  });
});

describe("trade row mapping", () => {
  it("maps a TradeDraft to snake_case", () => {
    const trade: TradeDraft = {
      instrumentKey: "NIFTY:2025-07-03:2500000:CE",
      segment: "OPT",
      product: "OTHER",
      direction: "LONG",
      openedAt: "2025-07-03T03:45:32.000Z",
      closedAt: "2025-07-03T05:00:00.000Z",
      quantity: 75,
      avgEntryPaise: 12050,
      avgExitPaise: 13000,
      grossPnlPaise: 71250,
      chargesPaise: null,
      charges: null,
      netPnlPaise: null,
      executionIds: ["e-1", "e-2"],
      setupTag: null,
      sessionBucket: "open_15",
      isExpiryDay: true,
      holdSeconds: 4468,
      rMultiple: null,
      notes: null,
      strategyGroupId: null,
    };
    expect(tradeRowFromDraft(trade, "user-1", "acct-1")).toMatchObject({
      instrument_key: "NIFTY:2025-07-03:2500000:CE",
      gross_pnl_paise: 71250,
      execution_ids: ["e-1", "e-2"],
      is_expiry_day: true,
      session_bucket: "open_15",
      net_pnl_paise: null,
    });
  });
});
