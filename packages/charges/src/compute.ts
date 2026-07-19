// Charge computation core (docs/charges-engine.md).
// Everything money is integer paise. Percent-of-turnover components multiply
// via double and round per component — isolated in roundPaise so PR C can tune
// rounding (incl. potential contract-note-level rupee rounding for STT)
// against real contract notes without touching the formulas.

import type { ChargeBreakdown } from "@zuo/types";
import type { CategoryRates, ChargeCategory, ChargeSide } from "./config-schema";

export interface OrderLeg {
  category: ChargeCategory;
  exchange: string; // NSE | BSE | MCX | NFO | BFO | CDS
  side: "BUY" | "SELL";
  /** sum of qty × pricePaise across the order's fills */
  turnoverPaise: number;
  tradeDate: string; // YYYY-MM-DD (IST trading date)
}

function roundPaise(value: number): number {
  return Math.round(value);
}

function sideApplies(on: ChargeSide, side: OrderLeg["side"]): boolean {
  return on === "both" || (on === "buy" ? side === "BUY" : side === "SELL");
}

function percentOf(turnoverPaise: number, percent: number): number {
  return roundPaise((turnoverPaise * percent) / 100);
}

export function computeBrokerage(leg: OrderLeg, rates: CategoryRates): number {
  const rule = rates.brokerage;
  switch (rule.type) {
    case "zero":
      return 0;
    case "flatPerOrder":
      return rule.paise;
    case "percentCappedPerOrder":
      return Math.min(percentOf(leg.turnoverPaise, rule.percent), rule.capPaise);
  }
}

/**
 * Exchange-txn lookup tolerates the derivative exchange aliases: NFO/BFO
 * trade under NSE/BSE rates, CDS under NSE.
 */
function exchangeTxnPercent(rates: CategoryRates, exchange: string): number {
  const alias: Record<string, string> = { NFO: "NSE", BFO: "BSE", CDS: "NSE" };
  const key = rates.exchangeTxnPercent[exchange] !== undefined ? exchange : (alias[exchange] ?? exchange);
  return rates.exchangeTxnPercent[key] ?? 0;
}

/**
 * Charges for one executed order leg. DP is NOT included here — it is per
 * scrip per sell DAY (delivery only); use computeDpCharge at the day level.
 * Exercise/assignment STT on exercised options is out of scope in v1.
 */
export function computeOrderCharges(leg: OrderLeg, rates: CategoryRates): ChargeBreakdown {
  const brokerage = computeBrokerage(leg, rates);
  const stt =
    rates.stt && sideApplies(rates.stt.on, leg.side)
      ? percentOf(leg.turnoverPaise, rates.stt.percent)
      : 0;
  const exchangeTxn = percentOf(leg.turnoverPaise, exchangeTxnPercent(rates, leg.exchange));
  // ₹/crore of turnover: crore rupees = 1e9 paise; result in paise = ₹ × 100
  const sebi = roundPaise((leg.turnoverPaise / 1e9) * rates.sebiPerCroreRupees * 100);
  const gst = roundPaise(((brokerage + exchangeTxn + sebi) * rates.gstPercent) / 100);
  const stampDuty = sideApplies(rates.stampDuty.on, leg.side)
    ? percentOf(leg.turnoverPaise, rates.stampDuty.percent)
    : 0;
  return { brokerage, stt, exchangeTxn, sebi, gst, stampDuty, dp: 0 };
}

/** Delivery-equity DP charge: flat per scrip per sell day (incl. GST). */
export function computeDpCharge(rates: CategoryRates): number {
  return rates.dpPerScripSellDayPaise ?? 0;
}

export function totalPaise(breakdown: ChargeBreakdown): number {
  return (
    breakdown.brokerage +
    breakdown.stt +
    breakdown.exchangeTxn +
    breakdown.sebi +
    breakdown.gst +
    breakdown.stampDuty +
    breakdown.dp
  );
}

export function addBreakdowns(a: ChargeBreakdown, b: ChargeBreakdown): ChargeBreakdown {
  return {
    brokerage: a.brokerage + b.brokerage,
    stt: a.stt + b.stt,
    exchangeTxn: a.exchangeTxn + b.exchangeTxn,
    sebi: a.sebi + b.sebi,
    gst: a.gst + b.gst,
    stampDuty: a.stampDuty + b.stampDuty,
    dp: a.dp + b.dp,
  };
}

export const EMPTY_BREAKDOWN: ChargeBreakdown = {
  brokerage: 0,
  stt: 0,
  exchangeTxn: 0,
  sebi: 0,
  gst: 0,
  stampDuty: 0,
  dp: 0,
};
