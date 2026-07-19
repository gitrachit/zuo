// Charge rate config schema (docs/charges-engine.md).
// Rates are DATA, never code: each ChargeRateEntry covers a date era and is
// immutable once verified — a new circular/budget means a NEW entry.
//
// Percent rates are plain numbers (0.1 = 0.1%). Rates are not money; money
// stays integer paise everywhere in the engine (PR B). Fixed amounts are paise.

/** How brokerage is computed for one executed ORDER (not per trade/execution). */
export type BrokerageRule =
  | { type: "zero" }
  | { type: "flatPerOrder"; paise: number }
  | { type: "percentCappedPerOrder"; percent: number; capPaise: number };

export type ChargeSide = "buy" | "sell" | "both";

export interface PercentBySide {
  percent: number;
  on: ChargeSide;
}

/** Segment+style bucket a trade leg is charged under. */
export const CHARGE_CATEGORIES = [
  "EQ_DELIVERY",
  "EQ_INTRADAY",
  "FUT",
  "OPT",
  "CURRENCY_FUT",
  "CURRENCY_OPT",
  "COMMODITY_FUT",
  "COMMODITY_OPT",
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export interface CategoryRates {
  brokerage: BrokerageRule;
  /** STT (equity/F&O) or CTT (commodity). Absent = not levied (currency). */
  stt?: PercentBySide;
  /** percent of turnover, keyed by exchange; missing exchange = 0. */
  exchangeTxnPercent: Record<string, number>;
  /** rupees per crore of turnover (₹10/crore standard; ₹1/crore agri). */
  sebiPerCroreRupees: number;
  /** 18% on (brokerage + exchange txn + SEBI). */
  gstPercent: number;
  stampDuty: PercentBySide;
  /** flat per scrip per sell day, incl. GST — delivery equity only. */
  dpPerScripSellDayPaise?: number;
}

export interface ChargeRateEntry {
  effectiveFrom: string; // YYYY-MM-DD inclusive
  effectiveTo: string | null; // YYYY-MM-DD inclusive; null = current
  /** where these numbers came from + fetch/verification date */
  source: string;
  /** false until matched against real contract notes (phase 2 gate) */
  verifiedAgainstContractNotes: boolean;
  rates: Record<ChargeCategory, CategoryRates>;
}

export interface ChargeRateConfig {
  broker: string;
  entries: ChargeRateEntry[];
}
