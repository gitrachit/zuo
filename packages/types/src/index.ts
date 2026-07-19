// Canonical shared types — docs/trade-model.md is the source of truth.

export * from "./trade-model";

export const APP_NAME = "Zuo";

export const EXCHANGES = ["NSE", "BSE", "MCX", "NFO", "BFO", "CDS", "GLOBAL"] as const;
export type Exchange = (typeof EXCHANGES)[number];

export const SEGMENTS = [
  "EQ",
  "FUT",
  "OPT",
  "COMMODITY_FUT",
  "COMMODITY_OPT",
  "CURRENCY",
] as const;
export type Segment = (typeof SEGMENTS)[number];

/** MIS = intraday, CNC = delivery, NRML = overnight derivatives. */
export const PRODUCTS = ["MIS", "CNC", "NRML", "OTHER"] as const;
export type Product = (typeof PRODUCTS)[number];

export const SIDES = ["BUY", "SELL"] as const;
export type Side = (typeof SIDES)[number];
