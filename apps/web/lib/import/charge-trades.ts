// Per-trade charge estimation (phase 2 PR D).
// Groups an account's executions into contract-note-style charge groups,
// computes note-level charges (packages/charges), allocates them back to
// executions pro-rata by turnover (componentwise, residue to the last
// execution so totals stay exact), then sums per trade.
//
// Equity style is INFERRED (matched qty intraday / residual delivery) and must
// be surfaced as an estimate in the UI. Trades touching a date outside every
// config era get charges null — never a neighbouring era's rates.

import {
  computeDpCharge,
  computeNoteCharges,
  groupIntoOrders,
  istTradeDate,
  selectRateEntry,
  splitEquityDay,
  totalPaise,
  zerodhaConfig,
  addBreakdowns,
  EMPTY_BREAKDOWN,
  type CategoryRates,
  type ChargeCategory,
  type GroupableExecution,
  type OrderLeg,
} from "@zuo/charges";
import type { ChargeBreakdown, Segment } from "@zuo/types";

export interface ChargeableExecution extends GroupableExecution {
  symbol: string;
  segment: Segment;
  optionType?: "CE" | "PE" | null;
}

export interface TradeForCharging {
  /** stable key for the caller (row index or id) */
  key: string;
  openedAt: string;
  closedAt: string | null;
  grossPnlPaise: number | null;
  executionIds: string[];
}

export interface TradeCharges {
  chargesPaise: number;
  charges: ChargeBreakdown;
  netPnlPaise: number | null;
}

export interface ChargeTradesResult {
  perTrade: Map<string, TradeCharges | null>; // null = era not covered
  uncoveredDates: string[];
  mixedEquityDays: number;
}

function derivativeCategory(exec: ChargeableExecution): ChargeCategory | null {
  switch (exec.segment) {
    case "FUT":
      return "FUT";
    case "OPT":
      return "OPT";
    case "COMMODITY_FUT":
      return "COMMODITY_FUT";
    case "COMMODITY_OPT":
      return "COMMODITY_OPT";
    case "CURRENCY":
      return exec.optionType ? "CURRENCY_OPT" : "CURRENCY_FUT";
    default:
      return null;
  }
}

const COMPONENTS = ["brokerage", "stt", "exchangeTxn", "sebi", "gst", "stampDuty", "dp"] as const;

/** Allocate a breakdown across executions pro-rata by turnover, exactly. */
function allocate(
  breakdown: ChargeBreakdown,
  execs: ChargeableExecution[],
): Map<string, ChargeBreakdown> {
  const turnovers = execs.map((e) => e.quantity * e.pricePaise);
  const total = turnovers.reduce((a, b) => a + b, 0);
  const out = new Map<string, ChargeBreakdown>(
    execs.map((e) => [e.id, { ...EMPTY_BREAKDOWN }]),
  );
  for (const component of COMPONENTS) {
    const value = breakdown[component];
    let allocated = 0;
    execs.forEach((exec, i) => {
      const share =
        i === execs.length - 1
          ? value - allocated
          : Math.round((value * (turnovers[i] ?? 0)) / (total || 1));
      allocated += share;
      out.get(exec.id)![component] += share;
    });
  }
  return out;
}

export function chargeTradesForAccount(
  executions: ChargeableExecution[],
  trades: TradeForCharging[],
): ChargeTradesResult {
  const config = zerodhaConfig();
  const uncoveredDates = new Set<string>();
  let mixedEquityDays = 0;
  const perExec = new Map<string, ChargeBreakdown>();
  const uncoveredExecIds = new Set<string>();

  // ---- group executions
  const groups = new Map<string, ChargeableExecution[]>();
  for (const exec of executions) {
    const date = istTradeDate(exec.executedAt);
    const category = derivativeCategory(exec);
    const key =
      category === null
        ? `EQ|${exec.exchange}|${exec.symbol}|${date}` // equity: per symbol-day (inference scope)
        : `${category}|${exec.exchange}|${date}`;
    const group = groups.get(key);
    if (group) group.push(exec);
    else groups.set(key, [exec]);
  }

  // ---- compute + allocate per group
  for (const [key, group] of groups) {
    const date = istTradeDate(group[0]!.executedAt);
    const entry = selectRateEntry(config, date);
    if (!entry) {
      uncoveredDates.add(date);
      for (const exec of group) uncoveredExecIds.add(exec.id);
      continue;
    }

    let breakdown: ChargeBreakdown;
    if (key.startsWith("EQ|")) {
      const orders = groupIntoOrders(group).map((o) => ({
        brokerOrderId: o.brokerOrderId,
        side: o.side,
        firstExecutedAt: o.tradeDate, // same IST day; FIFO within day uses real times
        quantity: o.quantity,
        turnoverPaise: o.turnoverPaise,
      }));
      // restore FIFO key from earliest execution per order
      for (const order of orders) {
        order.firstExecutedAt = group
          .filter((e) => e.brokerOrderId === order.brokerOrderId && e.side === order.side)
          .map((e) => e.executedAt)
          .sort()[0]!;
      }
      const split = splitEquityDay(orders);
      if (split.mixed) mixedEquityDays += 1;
      const legFor = (style: "intraday" | "delivery"): OrderLeg[] =>
        split.portions
          .filter((p) => p.style === style)
          .map((p) => ({
            category: style === "intraday" ? "EQ_INTRADAY" : "EQ_DELIVERY",
            exchange: group[0]!.exchange,
            side: p.side,
            turnoverPaise: p.turnoverPaise,
            tradeDate: date,
          }));
      const intradayRates: CategoryRates = entry.rates.EQ_INTRADAY;
      const deliveryRates: CategoryRates = entry.rates.EQ_DELIVERY;
      breakdown = addBreakdowns(
        computeNoteCharges(legFor("intraday"), intradayRates),
        computeNoteCharges(legFor("delivery"), deliveryRates),
      );
      if (split.sellResidualQty > 0) {
        breakdown = { ...breakdown, dp: breakdown.dp + computeDpCharge(deliveryRates) };
      }
    } else {
      const category = key.split("|")[0] as ChargeCategory;
      const legs: OrderLeg[] = groupIntoOrders(group).map((o) => ({
        category,
        exchange: o.exchange,
        side: o.side,
        turnoverPaise: o.turnoverPaise,
        tradeDate: o.tradeDate,
      }));
      breakdown = computeNoteCharges(legs, entry.rates[category]);
    }

    for (const [execId, share] of allocate(breakdown, group)) {
      perExec.set(execId, share);
    }
  }

  // ---- executions shared by two trades (flat-crossing) count once, on the
  // earliest trade; later trades treat them as already charged
  const chargedExecIds = new Set<string>();
  const perTrade = new Map<string, TradeCharges | null>();
  const byOpen = [...trades].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  for (const trade of byOpen) {
    if (trade.executionIds.some((id) => uncoveredExecIds.has(id))) {
      perTrade.set(trade.key, null);
      continue;
    }
    let sum = { ...EMPTY_BREAKDOWN };
    for (const execId of trade.executionIds) {
      if (chargedExecIds.has(execId)) continue;
      chargedExecIds.add(execId);
      const share = perExec.get(execId);
      if (share) sum = addBreakdowns(sum, share);
    }
    const chargesPaise = totalPaise(sum);
    perTrade.set(trade.key, {
      chargesPaise,
      charges: sum,
      netPnlPaise:
        trade.closedAt !== null && trade.grossPnlPaise !== null
          ? trade.grossPnlPaise - chargesPaise
          : null,
    });
  }

  return { perTrade, uncoveredDates: [...uncoveredDates].sort(), mixedEquityDays };
}
