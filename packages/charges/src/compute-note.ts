// Contract-note-level charge computation.
//
// Aggregation rules derived from the contract-note fixture pack (and to be
// re-confirmed against real Zerodha notes): brokerage is computed and rounded
// PER ORDER, while every turnover-based component (STT/CTT, exchange txn,
// SEBI, stamp duty) aggregates turnover across the whole note group FIRST and
// rounds once. GST applies to the already-rounded (brokerage + txn + SEBI).
// A note group = one (charge category, exchange, trade date).

import type { ChargeBreakdown } from "@zuo/types";
import { computeBrokerage, type OrderLeg } from "./compute";
import type { CategoryRates, ChargeSide } from "./config-schema";

function roundPaise(value: number): number {
  return Math.round(value);
}

function turnoverForSide(legs: OrderLeg[], on: ChargeSide): number {
  return legs
    .filter((l) => on === "both" || (on === "buy" ? l.side === "BUY" : l.side === "SELL"))
    .reduce((sum, l) => sum + l.turnoverPaise, 0);
}

/**
 * Charges for a group of order legs on one contract note. All legs must share
 * the same charge category, exchange, and trade date — mixing them here would
 * aggregate turnover across different rates. DP is not included (day-level,
 * delivery sells only — computeDpCharge).
 */
export function computeNoteCharges(legs: OrderLeg[], rates: CategoryRates): ChargeBreakdown {
  if (legs.length === 0) {
    return { brokerage: 0, stt: 0, exchangeTxn: 0, sebi: 0, gst: 0, stampDuty: 0, dp: 0 };
  }
  const exchange = legs[0]!.exchange;

  const brokerage = legs.reduce((sum, leg) => sum + computeBrokerage(leg, rates), 0);

  const totalTurnover = turnoverForSide(legs, "both");
  const stt = rates.stt
    ? roundPaise((turnoverForSide(legs, rates.stt.on) * rates.stt.percent) / 100)
    : 0;
  const txnPercent =
    rates.exchangeTxnPercent[exchange] ??
    rates.exchangeTxnPercent[{ NFO: "NSE", BFO: "BSE", CDS: "NSE" }[exchange] ?? exchange] ??
    0;
  const exchangeTxn = roundPaise((totalTurnover * txnPercent) / 100);
  const sebi = roundPaise((totalTurnover / 1e9) * rates.sebiPerCroreRupees * 100);
  const gst = roundPaise(((brokerage + exchangeTxn + sebi) * rates.gstPercent) / 100);
  const stampDuty = roundPaise(
    (turnoverForSide(legs, rates.stampDuty.on) * rates.stampDuty.percent) / 100,
  );

  return { brokerage, stt, exchangeTxn, sebi, gst, stampDuty, dp: 0 };
}
