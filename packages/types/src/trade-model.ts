// Canonical trade model — mirrors docs/trade-model.md (the source of truth).
// Two layers: raw Executions (as imported) → matched Trades (round trips).
// Executions are never destroyed; Trades are derived and re-derivable.

import type { Exchange, Product, Segment, Side } from "./index";

export const EXECUTION_SOURCES = [
  "zerodha_csv",
  "zerodha_kite",
  "dhan_api",
  "manual",
  "generic_csv",
] as const;
export type ExecutionSource = (typeof EXECUTION_SOURCES)[number];

export type OptionType = "CE" | "PE";

export interface Execution {
  id: string; // uuid
  userId: string;
  brokerAccountId: string; // fk → broker_accounts
  source: ExecutionSource;
  brokerTradeId: string; // broker's trade_id — dedupe key with brokerAccountId
  brokerOrderId: string;
  symbol: string; // broker tradingsymbol, e.g. NIFTY25JUL25000CE, GOLDM25AUGFUT
  exchange: Exchange;
  segment: Segment;
  product: Product;
  side: Side;
  quantity: number; // units (shares / lots*lotSize as units)
  pricePaise: number; // integer paise per unit
  executedAt: string; // UTC ISO
  // derivatives (nullable for EQ):
  underlying?: string; // NIFTY, GOLDM, RELIANCE
  expiry?: string; // YYYY-MM-DD
  strikePaise?: number;
  optionType?: OptionType;
  lotSize?: number;
  raw: Record<string, unknown>; // original row, jsonb
}

/** All values integer paise. Keys match the `charges` jsonb column. */
export interface ChargeBreakdown {
  stt: number;
  brokerage: number;
  exchangeTxn: number;
  gst: number;
  sebi: number;
  stampDuty: number;
  dp: number;
}

export const SESSION_BUCKETS = [
  "pre_open",
  "open_15",
  "morning",
  "midday",
  "afternoon",
  "close_30",
] as const;
export type SessionBucket = (typeof SESSION_BUCKETS)[number];

export type TradeDirection = "LONG" | "SHORT";

export interface Trade {
  id: string;
  userId: string;
  brokerAccountId: string;
  instrumentKey: string; // normalized: underlying+expiry+strike+optType or symbol
  segment: Segment;
  product: Product;
  direction: TradeDirection;
  openedAt: string;
  closedAt: string | null; // null = open position
  quantity: number;
  avgEntryPaise: number;
  avgExitPaise: number | null;
  grossPnlPaise: number | null;
  chargesPaise: number | null; // from packages/charges, itemized in charges jsonb
  charges: ChargeBreakdown | null;
  netPnlPaise: number | null;
  executionIds: string[];
  // enrichment (AI + rules):
  setupTag: string | null; // from user playbook or Haiku auto-tag
  sessionBucket: SessionBucket | null;
  isExpiryDay: boolean;
  holdSeconds: number | null;
  rMultiple: number | null; // requires user-set risk; null if unknown, never guessed
  notes: string | null;
  strategyGroupId: string | null; // multi-leg grouping, unused in v1
}

/**
 * Normalized instrument identity used for FIFO matching scope.
 * Derivatives: UNDERLYING:EXPIRY[:STRIKE_PAISE:OPT_TYPE]; equities: SYMBOL.
 * Deterministic — same instrument always yields the same key.
 */
export function buildInstrumentKey(input: {
  symbol: string;
  underlying?: string;
  expiry?: string;
  strikePaise?: number;
  optionType?: OptionType;
}): string {
  const { symbol, underlying, expiry, strikePaise, optionType } = input;
  if (underlying && expiry) {
    const parts = [underlying.trim().toUpperCase(), expiry];
    if (strikePaise !== undefined && optionType !== undefined) {
      parts.push(String(strikePaise), optionType);
    }
    return parts.join(":");
  }
  return symbol.trim().toUpperCase();
}
