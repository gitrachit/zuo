// Tolerant header mapping for Zerodha Console tradebook exports.
// Column names/casing drift between exports (docs/phase-1-spec.md), so headers
// are normalized and matched against aliases. Unmapped columns are surfaced as
// warnings — never silently dropped.

export const CANONICAL_FIELDS = [
  "symbol",
  "isin",
  "tradeDate",
  "exchange",
  "segment",
  "series",
  "tradeType",
  "auction",
  "quantity",
  "price",
  "tradeId",
  "orderId",
  "orderExecutionTime",
  "expiryDate",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  symbol: ["symbol", "tradingsymbol", "trading_symbol"],
  isin: ["isin"],
  tradeDate: ["trade_date", "date"],
  exchange: ["exchange"],
  segment: ["segment"],
  series: ["series"],
  tradeType: ["trade_type", "type", "buy_sell"],
  auction: ["auction"],
  quantity: ["quantity", "qty"],
  price: ["price", "rate", "trade_price"],
  tradeId: ["trade_id"],
  orderId: ["order_id"],
  orderExecutionTime: ["order_execution_time", "order_execution_datetime", "execution_time"],
  expiryDate: ["expiry_date", "expiry"],
};

/** Fields the importer cannot proceed without. */
const REQUIRED_FIELDS: CanonicalField[] = [
  "symbol",
  "exchange",
  "segment",
  "tradeType",
  "quantity",
  "price",
  "tradeId",
  "orderId",
];

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export interface HeaderMap {
  /** canonical field → column index in the source rows */
  fields: Partial<Record<CanonicalField, number>>;
  /** source headers that matched nothing — NOTIFY RS (spec) */
  unmapped: string[];
  /** required fields with no matching column; non-empty ⇒ file unusable */
  missingRequired: CanonicalField[];
}

export function mapHeaders(headers: string[]): HeaderMap {
  const aliasLookup = new Map<string, CanonicalField>();
  for (const field of CANONICAL_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) aliasLookup.set(alias, field);
  }

  const fields: Partial<Record<CanonicalField, number>> = {};
  const unmapped: string[] = [];
  headers.forEach((header, index) => {
    const field = aliasLookup.get(normalizeHeader(header));
    if (field !== undefined && fields[field] === undefined) fields[field] = index;
    else if (field === undefined && header.trim() !== "") unmapped.push(header.trim());
  });

  const missingRequired = REQUIRED_FIELDS.filter((f) => fields[f] === undefined);
  // executedAt needs a timestamp or at least a trade date
  if (fields.orderExecutionTime === undefined && fields.tradeDate === undefined) {
    missingRequired.push("tradeDate");
  }
  return { fields, unmapped, missingRequired };
}
