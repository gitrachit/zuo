// Executions → order legs. Brokerage is per executed ORDER (docs spec), so
// fills sharing (brokerOrderId, side, IST trade date) form one chargeable leg.

import type { ChargeCategory } from "./config-schema";

export interface GroupableExecution {
  id: string;
  brokerOrderId: string;
  side: "BUY" | "SELL";
  quantity: number;
  pricePaise: number;
  executedAt: string; // UTC ISO
  exchange: string;
}

export interface OrderGroup {
  brokerOrderId: string;
  side: "BUY" | "SELL";
  tradeDate: string; // IST date
  exchange: string;
  quantity: number;
  turnoverPaise: number;
  executionIds: string[];
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istTradeDate(utcIso: string): string {
  return new Date(new Date(utcIso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function groupIntoOrders(executions: GroupableExecution[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const exec of executions) {
    const tradeDate = istTradeDate(exec.executedAt);
    const key = `${exec.brokerOrderId}|${exec.side}|${tradeDate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += exec.quantity;
      existing.turnoverPaise += exec.quantity * exec.pricePaise;
      existing.executionIds.push(exec.id);
    } else {
      groups.set(key, {
        brokerOrderId: exec.brokerOrderId,
        side: exec.side,
        tradeDate,
        exchange: exec.exchange,
        quantity: exec.quantity,
        turnoverPaise: exec.quantity * exec.pricePaise,
        executionIds: [exec.id],
      });
    }
  }
  return [...groups.values()];
}

/**
 * Charge category for a segment. Equity needs the delivery/intraday style
 * decided by the caller (tradebook imports carry no MIS/CNC — the heuristic
 * lives in the app layer, surfaced to the user).
 */
export function categoryFor(
  segment: "EQ" | "FUT" | "OPT" | "COMMODITY_FUT" | "COMMODITY_OPT" | "CURRENCY",
  equityStyle: "delivery" | "intraday",
  currencyKind: "FUT" | "OPT" = "FUT",
): ChargeCategory {
  switch (segment) {
    case "EQ":
      return equityStyle === "delivery" ? "EQ_DELIVERY" : "EQ_INTRADAY";
    case "FUT":
      return "FUT";
    case "OPT":
      return "OPT";
    case "COMMODITY_FUT":
      return "COMMODITY_FUT";
    case "COMMODITY_OPT":
      return "COMMODITY_OPT";
    case "CURRENCY":
      return currencyKind === "FUT" ? "CURRENCY_FUT" : "CURRENCY_OPT";
  }
}
