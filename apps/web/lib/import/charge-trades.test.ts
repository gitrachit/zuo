import { describe, expect, it } from "vitest";
import {
  chargeTradesForAccount,
  type ChargeableExecution,
  type TradeForCharging,
} from "./charge-trades";

let seq = 0;
function exec(
  partial: Partial<ChargeableExecution> &
    Pick<ChargeableExecution, "side" | "quantity" | "pricePaise" | "executedAt">,
): ChargeableExecution {
  seq += 1;
  return {
    id: String(seq),
    brokerOrderId: `O${seq}`,
    exchange: "MCX",
    symbol: "GOLDM26AUGFUT",
    segment: "COMMODITY_FUT",
    ...partial,
  };
}

describe("chargeTradesForAccount", () => {
  it("charges a covered-era MCX round trip and fills net P&L", () => {
    // mirrors MCX_GOLDM_001 magnitudes: buy 1@74850, sell 1@75240 (2026-07-18 IST)
    const executions = [
      exec({ side: "BUY", quantity: 1, pricePaise: 7485000, executedAt: "2026-07-18T11:42:31.000Z" }),
      exec({ side: "SELL", quantity: 1, pricePaise: 7524000, executedAt: "2026-07-18T15:18:52.000Z" }),
    ];
    const trades: TradeForCharging[] = [
      {
        key: "t1",
        openedAt: executions[0]!.executedAt,
        closedAt: executions[1]!.executedAt,
        grossPnlPaise: 39000,
        executionIds: executions.map((e) => e.id),
      },
    ];
    const result = chargeTradesForAccount(executions, trades);
    const t1 = result.perTrade.get("t1");
    expect(t1).not.toBeNull();
    // real Zerodha current-era rates (not the synthetic pack's): brokerage is
    // percent-capped ₹20/order → ₹40; CTT 0.01% sell; MCX txn 0.0021%
    expect(t1?.charges.brokerage).toBe(4000);
    expect(t1?.charges.stt).toBe(752);
    expect(t1?.charges.exchangeTxn).toBe(315);
    expect(t1?.netPnlPaise).toBe(39000 - t1!.chargesPaise);
    expect(result.uncoveredDates).toEqual([]);
  });

  it("returns null charges for trades outside every config era", () => {
    const executions = [
      exec({ segment: "OPT", exchange: "NFO", symbol: "ICICIBANK20JUN440CE", side: "BUY", quantity: 1375, pricePaise: 70, executedAt: "2020-05-29T04:31:18.000Z" }),
    ];
    const trades: TradeForCharging[] = [
      { key: "t1", openedAt: executions[0]!.executedAt, closedAt: null, grossPnlPaise: null, executionIds: [executions[0]!.id] },
    ];
    const result = chargeTradesForAccount(executions, trades);
    expect(result.perTrade.get("t1")).toBeNull();
    expect(result.uncoveredDates).toEqual(["2020-05-29"]);
  });

  it("mixed equity day: intraday + delivery + DP on the residual sell, allocation exact", () => {
    // buy 40, sell 25, sell 40 → matched 40 intraday buys... buys 40, sells 65:
    // matched 40, residual sell 25 → delivery sell → DP applies
    const base = { exchange: "NSE", symbol: "INFY", segment: "EQ" as const };
    const executions = [
      exec({ ...base, side: "BUY", quantity: 40, pricePaise: 160000, executedAt: "2026-07-14T04:05:10.000Z" }),
      exec({ ...base, side: "SELL", quantity: 25, pricePaise: 161200, executedAt: "2026-07-14T09:12:18.000Z" }),
      exec({ ...base, side: "SELL", quantity: 40, pricePaise: 160800, executedAt: "2026-07-14T09:35:02.000Z" }),
    ];
    const trades: TradeForCharging[] = [
      {
        key: "t1",
        openedAt: executions[0]!.executedAt,
        closedAt: executions[2]!.executedAt,
        grossPnlPaise: 40 * 800, // synthetic — matcher supplies the real figure
        executionIds: executions.map((e) => e.id),
      },
    ];
    const result = chargeTradesForAccount(executions, trades);
    expect(result.mixedEquityDays).toBe(1);
    const t1 = result.perTrade.get("t1");
    expect(t1).not.toBeNull();
    expect(t1!.charges.dp).toBe(1534); // residual sell → delivery DP
    // delivery STT (both sides) present because part of the day is delivery
    expect(t1!.charges.stt).toBeGreaterThan(0);
    expect(t1!.chargesPaise).toBe(
      Object.values(t1!.charges).reduce((a, b) => a + b, 0),
    );
  });

  it("flat-crossing executions are charged once, on the earliest trade", () => {
    const executions = [
      exec({ side: "BUY", quantity: 10, pricePaise: 7000000, executedAt: "2026-07-18T05:00:00.000Z" }),
      exec({ side: "SELL", quantity: 15, pricePaise: 7100000, executedAt: "2026-07-18T06:00:00.000Z" }),
    ];
    const sharedId = executions[1]!.id;
    const trades: TradeForCharging[] = [
      { key: "closed", openedAt: executions[0]!.executedAt, closedAt: executions[1]!.executedAt, grossPnlPaise: 10 * 100000, executionIds: [executions[0]!.id, sharedId] },
      { key: "reversed", openedAt: executions[1]!.executedAt, closedAt: null, grossPnlPaise: null, executionIds: [sharedId] },
    ];
    const result = chargeTradesForAccount(executions, trades);
    const closed = result.perTrade.get("closed")!;
    const reversed = result.perTrade.get("reversed")!;
    expect(closed.chargesPaise).toBeGreaterThan(0);
    expect(reversed.chargesPaise).toBe(0); // shared execution already charged
  });
});
