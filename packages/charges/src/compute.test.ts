import { describe, expect, it } from "vitest";
import {
  addBreakdowns,
  computeDpCharge,
  computeOrderCharges,
  totalPaise,
  type OrderLeg,
} from "./compute";
import { categoryFor, groupIntoOrders, istTradeDate } from "./group-orders";
import { selectRateEntry, zerodhaConfig } from "./select-config";

const current = selectRateEntry(zerodhaConfig(), "2026-07-19")!;

function leg(partial: Partial<OrderLeg>): OrderLeg {
  return {
    category: "EQ_INTRADAY",
    exchange: "NSE",
    side: "BUY",
    turnoverPaise: 10_000_000, // ₹1,00,000
    tradeDate: "2026-07-19",
    ...partial,
  };
}

describe("computeOrderCharges — hand-computed per category (current era)", () => {
  it("EQ intraday buy ₹1,00,000 on NSE", () => {
    const charges = computeOrderCharges(leg({}), current.rates.EQ_INTRADAY);
    expect(charges).toEqual({
      brokerage: 2000, // min(0.03% of ₹1L = ₹30, ₹20 cap) = ₹20
      stt: 0, // sell-side only
      exchangeTxn: 307, // 0.00307% = ₹3.07
      sebi: 10, // ₹10/crore on ₹1L = ₹0.10
      gst: 417, // 18% of (2000+307+10) = 417.06 → 417
      stampDuty: 300, // 0.003% buy = ₹3
      dp: 0,
    });
    expect(totalPaise(charges)).toBe(3034);
  });

  it("EQ intraday sell pays STT but no stamp duty", () => {
    const charges = computeOrderCharges(leg({ side: "SELL" }), current.rates.EQ_INTRADAY);
    expect(charges.stt).toBe(2500); // 0.025% of ₹1L = ₹25
    expect(charges.stampDuty).toBe(0);
  });

  it("EQ delivery buy: zero brokerage, STT both sides", () => {
    const charges = computeOrderCharges(
      leg({ category: "EQ_DELIVERY" }),
      current.rates.EQ_DELIVERY,
    );
    expect(charges.brokerage).toBe(0);
    expect(charges.stt).toBe(10000); // 0.1% both sides = ₹100
    expect(charges.stampDuty).toBe(1500); // 0.015% buy = ₹15
    expect(charges.gst).toBe(57); // 18% of (0+307+10)
  });

  it("index option sell ₹50,000 premium on NFO (NSE rates via alias)", () => {
    const charges = computeOrderCharges(
      leg({ category: "OPT", exchange: "NFO", side: "SELL", turnoverPaise: 5_000_000 }),
      current.rates.OPT,
    );
    expect(charges).toEqual({
      brokerage: 2000, // flat ₹20
      stt: 7500, // 0.15% sell on premium = ₹75
      exchangeTxn: 1777, // 0.03553% = ₹17.765 → 1777 (round to paisa)
      sebi: 5,
      gst: 681, // 18% of (2000+1777+5) = 680.76 → 681
      stampDuty: 0,
      dp: 0,
    });
  });

  it("futures buy: small turnover keeps percent brokerage under the cap", () => {
    // ₹40,000 turnover → 0.03% = ₹12 < ₹20 cap
    const charges = computeOrderCharges(
      leg({ category: "FUT", exchange: "NFO", turnoverPaise: 4_000_000 }),
      current.rates.FUT,
    );
    expect(charges.brokerage).toBe(1200);
    expect(charges.stt).toBe(0); // sell-side only
    expect(charges.exchangeTxn).toBe(73); // 0.00183% = ₹0.732 → 73
    expect(charges.stampDuty).toBe(80); // 0.002% buy
  });

  it("MCX GOLDM futures sell pays CTT, MCX txn rate", () => {
    // ₹9,00,000 turnover (10 units × ₹90,000... in paise)
    const charges = computeOrderCharges(
      leg({ category: "COMMODITY_FUT", exchange: "MCX", side: "SELL", turnoverPaise: 90_000_000 }),
      current.rates.COMMODITY_FUT,
    );
    expect(charges.brokerage).toBe(2000); // 0.03% = ₹270 → capped ₹20
    expect(charges.stt).toBe(9000); // CTT 0.01% sell = ₹9
    expect(charges.exchangeTxn).toBe(1890); // 0.0021% = ₹18.90
    expect(charges.sebi).toBe(90);
    expect(charges.stampDuty).toBe(0);
  });

  it("currency futures have no STT", () => {
    const charges = computeOrderCharges(
      leg({ category: "CURRENCY_FUT", exchange: "CDS", side: "SELL" }),
      current.rates.CURRENCY_FUT,
    );
    expect(charges.stt).toBe(0);
    expect(charges.exchangeTxn).toBe(35); // CDS → NSE alias, 0.00035%
  });

  it("unknown exchange with no rate contributes zero txn, not a crash", () => {
    const charges = computeOrderCharges(
      leg({ category: "FUT", exchange: "BFO" }),
      current.rates.FUT,
    );
    expect(charges.exchangeTxn).toBe(0); // BFO → BSE rate is 0 for futures
  });
});

describe("dp + aggregation helpers", () => {
  it("DP charge only where configured (delivery equity)", () => {
    expect(computeDpCharge(current.rates.EQ_DELIVERY)).toBe(1534);
    expect(computeDpCharge(current.rates.EQ_INTRADAY)).toBe(0);
  });

  it("addBreakdowns sums componentwise", () => {
    const a = computeOrderCharges(leg({}), current.rates.EQ_INTRADAY);
    const sum = addBreakdowns(a, a);
    expect(sum.brokerage).toBe(2 * a.brokerage);
    expect(totalPaise(sum)).toBe(2 * totalPaise(a));
  });
});

describe("groupIntoOrders", () => {
  it("groups fills of one order+side+day and sums turnover exactly", () => {
    const groups = groupIntoOrders([
      { id: "1", brokerOrderId: "O1", side: "BUY", quantity: 5, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z", exchange: "NSE" },
      { id: "2", brokerOrderId: "O1", side: "BUY", quantity: 5, pricePaise: 10010, executedAt: "2025-07-03T04:00:01.000Z", exchange: "NSE" },
      { id: "3", brokerOrderId: "O2", side: "SELL", quantity: 10, pricePaise: 10100, executedAt: "2025-07-03T05:00:00.000Z", exchange: "NSE" },
    ]);
    expect(groups).toHaveLength(2);
    const o1 = groups.find((g) => g.brokerOrderId === "O1");
    expect(o1).toMatchObject({ quantity: 10, turnoverPaise: 100050, executionIds: ["1", "2"] });
  });

  it("splits the same order id across IST days (late-evening MCX boundary)", () => {
    // 20:00 UTC = 01:30 IST next day; 10:00 UTC = 15:30 IST same day
    const groups = groupIntoOrders([
      { id: "1", brokerOrderId: "O1", side: "BUY", quantity: 1, pricePaise: 100, executedAt: "2025-07-03T10:00:00.000Z", exchange: "MCX" },
      { id: "2", brokerOrderId: "O1", side: "BUY", quantity: 1, pricePaise: 100, executedAt: "2025-07-03T20:00:00.000Z", exchange: "MCX" },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("istTradeDate converts UTC to IST dates", () => {
    expect(istTradeDate("2025-07-03T20:00:00.000Z")).toBe("2025-07-04");
    expect(istTradeDate("2025-07-03T10:00:00.000Z")).toBe("2025-07-03");
  });
});

describe("categoryFor", () => {
  it("maps segments with the equity style decided by the caller", () => {
    expect(categoryFor("EQ", "delivery")).toBe("EQ_DELIVERY");
    expect(categoryFor("EQ", "intraday")).toBe("EQ_INTRADAY");
    expect(categoryFor("FUT", "intraday")).toBe("FUT");
    expect(categoryFor("OPT", "delivery")).toBe("OPT");
    expect(categoryFor("COMMODITY_FUT", "intraday")).toBe("COMMODITY_FUT");
    expect(categoryFor("CURRENCY", "intraday", "OPT")).toBe("CURRENCY_OPT");
  });
});
