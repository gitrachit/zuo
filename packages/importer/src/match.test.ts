import { describe, expect, it } from "vitest";
import { matchExecutions, sessionBucketForIst, type MatchableExecution } from "./match";

let seq = 0;
function exec(partial: Partial<MatchableExecution> & Pick<MatchableExecution, "side" | "quantity" | "pricePaise" | "executedAt">): MatchableExecution {
  seq += 1;
  return {
    id: String(seq),
    symbol: "RELIANCE",
    segment: "EQ",
    product: "OTHER",
    ...partial,
  };
}

describe("matchExecutions — round trips", () => {
  it("matches an EQ multi-day delivery round trip", () => {
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 10, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ side: "SELL", quantity: 10, pricePaise: 11000, executedAt: "2025-07-04T05:00:00.000Z" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      instrumentKey: "RELIANCE",
      direction: "LONG",
      quantity: 10,
      avgEntryPaise: 10000,
      avgExitPaise: 11000,
      grossPnlPaise: 10000, // ₹100
      closedAt: "2025-07-04T05:00:00.000Z",
      holdSeconds: 90000,
      chargesPaise: null,
      netPnlPaise: null,
    });
  });

  it("aggregates scale-in/scale-out into one trade with exact sums", () => {
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 5, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ side: "BUY", quantity: 5, pricePaise: 11000, executedAt: "2025-07-03T04:10:00.000Z" }),
      exec({ side: "SELL", quantity: 4, pricePaise: 12000, executedAt: "2025-07-03T05:00:00.000Z" }),
      exec({ side: "SELL", quantity: 6, pricePaise: 11500, executedAt: "2025-07-03T06:00:00.000Z" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      quantity: 10,
      avgEntryPaise: 10500,
      avgExitPaise: 11700,
      grossPnlPaise: 12000,
    });
  });

  it("a SHORT round trip inverts the P&L", () => {
    const trades = matchExecutions([
      exec({ side: "SELL", quantity: 75, pricePaise: 12000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ side: "BUY", quantity: 75, pricePaise: 10000, executedAt: "2025-07-03T05:00:00.000Z" }),
    ]);
    expect(trades[0]).toMatchObject({
      direction: "SHORT",
      grossPnlPaise: 75 * 2000,
    });
  });

  it("returning to flat then re-entering makes two separate trades", () => {
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 10, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ side: "SELL", quantity: 10, pricePaise: 10100, executedAt: "2025-07-03T04:30:00.000Z" }),
      exec({ side: "BUY", quantity: 20, pricePaise: 9900, executedAt: "2025-07-03T06:00:00.000Z" }),
      exec({ side: "SELL", quantity: 20, pricePaise: 10050, executedAt: "2025-07-03T07:00:00.000Z" }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.quantity)).toEqual([10, 20]);
    expect(trades.map((t) => t.grossPnlPaise)).toEqual([1000, 3000]);
  });

  it("an execution crossing through flat closes and reverses, sharing the execution id", () => {
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 100, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ side: "SELL", quantity: 150, pricePaise: 10200, executedAt: "2025-07-03T05:00:00.000Z" }),
    ]);
    expect(trades).toHaveLength(2);
    const [closed, reversed] = trades;
    expect(closed).toMatchObject({
      direction: "LONG",
      quantity: 100,
      grossPnlPaise: 100 * 200,
    });
    expect(reversed).toMatchObject({
      direction: "SHORT",
      quantity: 50,
      avgEntryPaise: 10200,
      closedAt: null,
      grossPnlPaise: null,
    });
    expect(reversed?.executionIds).toEqual(closed?.executionIds?.slice(1, 2));
  });

  it("keeps open positions open at range edges", () => {
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 10, pricePaise: 7250000, executedAt: "2025-07-03T09:00:00.000Z" }),
    ]);
    expect(trades[0]).toMatchObject({
      closedAt: null,
      avgExitPaise: null,
      grossPnlPaise: null,
      holdSeconds: null,
    });
  });
});

describe("matchExecutions — scoping", () => {
  it("separates products in the same symbol (MIS vs CNC)", () => {
    const trades = matchExecutions([
      exec({ product: "MIS", side: "BUY", quantity: 10, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ product: "CNC", side: "SELL", quantity: 10, pricePaise: 10100, executedAt: "2025-07-03T04:05:00.000Z" }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades.every((t) => t.closedAt === null)).toBe(true);
  });

  it("separates instruments by strike via instrumentKey", () => {
    const base = {
      symbol: "NIFTY25JUL25000CE",
      segment: "OPT" as const,
      underlying: "NIFTY",
      expiry: "2025-07-31",
      optionType: "CE" as const,
    };
    const trades = matchExecutions([
      exec({ ...base, strikePaise: 2500000, side: "BUY", quantity: 75, pricePaise: 8000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ ...base, symbol: "NIFTY25JUL25100CE", strikePaise: 2510000, side: "SELL", quantity: 75, pricePaise: 6000, executedAt: "2025-07-03T04:01:00.000Z" }),
    ]);
    expect(trades).toHaveLength(2);
    expect(new Set(trades.map((t) => t.instrumentKey)).size).toBe(2);
  });

  it("sorts shuffled input by executedAt with numeric-aware id tiebreak", () => {
    const trades = matchExecutions([
      exec({ side: "SELL", quantity: 10, pricePaise: 11000, executedAt: "2025-07-04T05:00:00.000Z" }),
      exec({ side: "BUY", quantity: 10, pricePaise: 10000, executedAt: "2025-07-03T04:00:00.000Z" }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]?.direction).toBe("LONG");
  });
});

describe("enrichment", () => {
  it("flags isExpiryDay when an execution lands on the expiry (IST date)", () => {
    const base = {
      symbol: "NIFTY2570325000CE",
      segment: "OPT" as const,
      underlying: "NIFTY",
      expiry: "2025-07-03",
      strikePaise: 2500000,
      optionType: "CE" as const,
    };
    const trades = matchExecutions([
      exec({ ...base, side: "BUY", quantity: 75, pricePaise: 8000, executedAt: "2025-07-03T04:00:00.000Z" }),
      exec({ ...base, side: "SELL", quantity: 75, pricePaise: 9000, executedAt: "2025-07-03T05:00:00.000Z" }),
    ]);
    expect(trades[0]?.isExpiryDay).toBe(true);
  });

  it("sessionBucket comes from openedAt IST", () => {
    // 04:00 UTC = 09:30 IST → morning; 03:50 UTC = 09:20 IST → open_15
    const trades = matchExecutions([
      exec({ side: "BUY", quantity: 1, pricePaise: 100, executedAt: "2025-07-03T03:50:00.000Z" }),
      exec({ side: "SELL", quantity: 1, pricePaise: 100, executedAt: "2025-07-03T04:30:00.000Z" }),
    ]);
    expect(trades[0]?.sessionBucket).toBe("open_15");
  });

  it("sessionBucketForIst boundaries", () => {
    expect(sessionBucketForIst(9 * 60 - 1)).toBeNull();
    expect(sessionBucketForIst(9 * 60)).toBe("pre_open");
    expect(sessionBucketForIst(9 * 60 + 15)).toBe("open_15");
    expect(sessionBucketForIst(10 * 60)).toBe("morning");
    expect(sessionBucketForIst(12 * 60)).toBe("midday");
    expect(sessionBucketForIst(14 * 60)).toBe("afternoon");
    expect(sessionBucketForIst(15 * 60)).toBe("close_30");
    expect(sessionBucketForIst(22 * 60)).toBeNull(); // MCX evening
  });
});
