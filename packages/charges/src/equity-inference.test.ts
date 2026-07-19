import { describe, expect, it } from "vitest";
import { splitEquityDay, type EquityDayOrder } from "./equity-inference";

function order(partial: Partial<EquityDayOrder> & Pick<EquityDayOrder, "side" | "quantity">): EquityDayOrder {
  return {
    brokerOrderId: "O1",
    firstExecutedAt: "2026-07-14T04:00:00.000Z",
    turnoverPaise: partial.quantity * 10000,
    ...partial,
  };
}

describe("splitEquityDay", () => {
  it("flat day → everything intraday", () => {
    const split = splitEquityDay([
      order({ brokerOrderId: "B1", side: "BUY", quantity: 40 }),
      order({ brokerOrderId: "S1", side: "SELL", quantity: 40 }),
    ]);
    expect(split.matchedQty).toBe(40);
    expect(split.mixed).toBe(false);
    expect(split.portions.every((p) => p.style === "intraday")).toBe(true);
  });

  it("buy-only day → everything delivery", () => {
    const split = splitEquityDay([order({ side: "BUY", quantity: 15 })]);
    expect(split.matchedQty).toBe(0);
    expect(split.portions).toEqual([
      expect.objectContaining({ style: "delivery", quantity: 15 }),
    ]);
  });

  it("mixed day: matched qty intraday, residual delivery, FIFO on the long side", () => {
    // buy 100 (two orders), sell 60 → 60 matched (earliest buys first), 40 delivery
    const split = splitEquityDay([
      order({ brokerOrderId: "B1", side: "BUY", quantity: 50, firstExecutedAt: "2026-07-14T04:00:00.000Z" }),
      order({ brokerOrderId: "B2", side: "BUY", quantity: 50, firstExecutedAt: "2026-07-14T05:00:00.000Z" }),
      order({ brokerOrderId: "S1", side: "SELL", quantity: 60, firstExecutedAt: "2026-07-14T06:00:00.000Z" }),
    ]);
    expect(split.matchedQty).toBe(60);
    expect(split.mixed).toBe(true);
    expect(split.buyResidualQty).toBe(40);
    expect(split.sellResidualQty).toBe(0);
    expect(split.portions).toEqual([
      expect.objectContaining({ brokerOrderId: "B1", style: "intraday", quantity: 50 }),
      expect.objectContaining({ brokerOrderId: "B2", style: "intraday", quantity: 10 }),
      expect.objectContaining({ brokerOrderId: "B2", style: "delivery", quantity: 40 }),
      expect.objectContaining({ brokerOrderId: "S1", style: "intraday", quantity: 60 }),
    ]);
  });

  it("splits order turnover pro-rata with the residue on the delivery portion", () => {
    const split = splitEquityDay([
      order({ brokerOrderId: "B1", side: "BUY", quantity: 3, turnoverPaise: 1000 }),
      order({ brokerOrderId: "S1", side: "SELL", quantity: 1, turnoverPaise: 400 }),
    ]);
    const b1 = split.portions.filter((p) => p.brokerOrderId === "B1");
    expect(b1).toEqual([
      expect.objectContaining({ style: "intraday", quantity: 1, turnoverPaise: 333 }),
      expect.objectContaining({ style: "delivery", quantity: 2, turnoverPaise: 667 }),
    ]);
    // exact total preserved
    expect(b1.reduce((s, p) => s + p.turnoverPaise, 0)).toBe(1000);
  });
});
