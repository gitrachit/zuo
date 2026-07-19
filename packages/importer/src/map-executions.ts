// Row → ExecutionDraft mapping for Zerodha Console tradebooks.
// Pure: takes headers + cell rows (from CSV or XLSX), returns drafts + warnings.
// Console tradebooks carry no product column — product is 'OTHER' in v1 and the
// limitation is surfaced in the import summary (docs/phase-1-spec.md).

import type { Exchange, Execution, Segment, Side } from "@zuo/types";
import { mapHeaders, type CanonicalField, type HeaderMap } from "./headers";
import { parseTradingSymbol } from "./symbol";

/** Execution minus the DB-assigned identifiers. */
export type ExecutionDraft = Omit<Execution, "id" | "userId" | "brokerAccountId">;

export type Cell = string | number | Date | null | undefined;

export interface ImportWarning {
  code:
    | "unmapped_columns"
    | "missing_required_columns"
    | "bad_row"
    | "unparseable_derivative_symbol"
    | "expiry_unknown"
    | "price_rounded_to_paisa"
    | "execution_time_missing"
    | "auction_row";
  message: string;
  count: number;
}

export interface MapResult {
  drafts: ExecutionDraft[];
  warnings: ImportWarning[];
  rowsRead: number;
  rowsSkipped: number;
}

class Warnings {
  private byKey = new Map<string, ImportWarning>();
  add(code: ImportWarning["code"], message: string) {
    const key = `${code}:${message}`;
    const existing = this.byKey.get(key);
    if (existing) existing.count += 1;
    else this.byKey.set(key, { code, message, count: 1 });
  }
  list(): ImportWarning[] {
    return [...this.byKey.values()];
  }
}

function cellString(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

/** "1450.75" | 1450.75 → 145075 paise. Integer string math; >2dp rounds half-up. */
export function rupeesToPaise(value: Cell): { paise: number; rounded: boolean } | null {
  const s = cellString(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!match || match[1] === undefined) return null;
  const frac = match[2] ?? "";
  const base = Number(match[1]) * 100 + Number((frac + "00").slice(0, 2));
  if (frac.length <= 2) return { paise: base, rounded: false };
  const roundUp = Number(frac[2]) >= 5;
  return { paise: base + (roundUp ? 1 : 0), rounded: true };
}

/** Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO datetime, Date → YYYY-MM-DD. */
export function toIsoDate(value: Cell): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = cellString(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return s.slice(0, 10);
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

/** Zerodha exports are IST. Returns UTC ISO, or null if unparseable. */
export function istToUtc(date: string, time?: string): string | null {
  const t = time && /^\d{2}:\d{2}(:\d{2})?$/.test(time) ? time : "00:00:00";
  const candidate = new Date(`${date}T${t}+05:30`);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

function executedAtFrom(
  executionTime: Cell,
  tradeDate: Cell,
): { iso: string; timeKnown: boolean } | null {
  if (executionTime instanceof Date) {
    return { iso: executionTime.toISOString(), timeKnown: true };
  }
  const timeStr = cellString(executionTime);
  const dt = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(timeStr);
  if (dt && dt[1] && dt[2]) {
    const iso = istToUtc(dt[1], dt[2].length === 5 ? `${dt[2]}:00` : dt[2]);
    if (iso) return { iso, timeKnown: true };
  }
  const dateOnly = toIsoDate(tradeDate);
  if (dateOnly) {
    const iso = istToUtc(dateOnly);
    if (iso) return { iso, timeKnown: false };
  }
  return null;
}

interface InstrumentInfo {
  exchange: Exchange;
  segment: Segment;
  underlying?: string;
  expiry?: string;
  strikePaise?: number;
  optionType?: "CE" | "PE";
  parseFailed: boolean;
  expiryUnknown: boolean;
}

function deriveInstrument(
  rawExchange: string,
  rawSegment: string,
  symbol: string,
  expiryCell: Cell,
): InstrumentInfo | null {
  const ex = rawExchange.trim().toUpperCase();
  const seg = rawSegment.trim().toUpperCase().replace(/[^A-Z]/g, "");

  if (seg === "EQ" || seg === "EQUITY") {
    if (ex !== "NSE" && ex !== "BSE") return null;
    return { exchange: ex, segment: "EQ", parseFailed: false, expiryUnknown: false };
  }

  const parsed = parseTradingSymbol(symbol);
  const isFut = parsed?.kind === "FUT";
  const columnExpiry = toIsoDate(expiryCell);
  const symbolExpiry =
    parsed && parsed.expiryDay !== null
      ? `${parsed.expiryYear}-${String(parsed.expiryMonth).padStart(2, "0")}-${String(parsed.expiryDay).padStart(2, "0")}`
      : null;
  const expiry = columnExpiry ?? symbolExpiry ?? undefined;

  let exchange: Exchange;
  let segment: Segment;
  if (seg === "FO" || seg === "FNO" || ex === "NFO" || ex === "BFO") {
    exchange = ex === "BFO" || ex === "BSE" ? "BFO" : "NFO";
    segment = isFut ? "FUT" : "OPT";
  } else if (seg === "COM" || seg === "COMMODITY" || ex === "MCX") {
    exchange = "MCX";
    segment = isFut ? "COMMODITY_FUT" : "COMMODITY_OPT";
  } else if (seg === "CDS" || seg === "CURRENCY" || ex === "CDS") {
    exchange = "CDS";
    segment = "CURRENCY";
  } else {
    return null;
  }

  return {
    exchange,
    segment,
    underlying: parsed?.underlying,
    expiry,
    strikePaise: parsed?.strikePaise,
    optionType: parsed?.optionType,
    parseFailed: parsed === null,
    expiryUnknown: expiry === undefined,
  };
}

export function mapTradebookRows(headers: string[], rows: Cell[][]): MapResult {
  const warnings = new Warnings();
  const headerMap: HeaderMap = mapHeaders(headers);

  if (headerMap.unmapped.length > 0) {
    warnings.add("unmapped_columns", `Unmapped columns: ${headerMap.unmapped.join(", ")}`);
  }
  if (headerMap.missingRequired.length > 0) {
    warnings.add(
      "missing_required_columns",
      `Missing required columns: ${headerMap.missingRequired.join(", ")}`,
    );
    return { drafts: [], warnings: warnings.list(), rowsRead: rows.length, rowsSkipped: rows.length };
  }

  const get = (row: Cell[], field: CanonicalField): Cell => {
    const index = headerMap.fields[field];
    return index === undefined ? undefined : row[index];
  };

  const drafts: ExecutionDraft[] = [];
  let rowsSkipped = 0;

  rows.forEach((row, rowIndex) => {
    const skip = (reason: string) => {
      rowsSkipped += 1;
      warnings.add("bad_row", reason);
    };
    if (row.every((c) => cellString(c) === "")) {
      rowsSkipped += 1;
      return;
    }

    const symbol = cellString(get(row, "symbol")).toUpperCase();
    const tradeId = cellString(get(row, "tradeId"));
    const orderId = cellString(get(row, "orderId"));
    if (symbol === "" || tradeId === "") {
      return skip(`row ${rowIndex + 2}: missing symbol or trade_id`);
    }

    const sideRaw = cellString(get(row, "tradeType")).toLowerCase();
    const side: Side | null = sideRaw === "buy" || sideRaw === "b" ? "BUY"
      : sideRaw === "sell" || sideRaw === "s" ? "SELL" : null;
    if (side === null) return skip(`row ${rowIndex + 2}: bad trade_type "${sideRaw}"`);

    const quantityNum = Number(cellString(get(row, "quantity")));
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
      return skip(`row ${rowIndex + 2}: bad quantity`);
    }

    const price = rupeesToPaise(get(row, "price"));
    if (price === null) return skip(`row ${rowIndex + 2}: bad price`);
    if (price.rounded) {
      warnings.add("price_rounded_to_paisa", `price with >2 decimals rounded (${symbol})`);
    }

    const executedAt = executedAtFrom(get(row, "orderExecutionTime"), get(row, "tradeDate"));
    if (executedAt === null) return skip(`row ${rowIndex + 2}: no usable execution time/date`);
    if (!executedAt.timeKnown) {
      warnings.add("execution_time_missing", "order_execution_time absent; using trade_date midnight IST");
    }

    const instrument = deriveInstrument(
      cellString(get(row, "exchange")),
      cellString(get(row, "segment")),
      symbol,
      get(row, "expiryDate"),
    );
    if (instrument === null) {
      return skip(`row ${rowIndex + 2}: unrecognized exchange/segment combination`);
    }
    if (instrument.parseFailed) {
      warnings.add("unparseable_derivative_symbol", `could not parse derivative symbol ${symbol}`);
    }
    if (instrument.segment !== "EQ" && instrument.expiryUnknown) {
      warnings.add("expiry_unknown", `expiry unknown for ${symbol} (monthly symbol, no expiry column)`);
    }
    if (cellString(get(row, "auction")).toLowerCase() === "true") {
      warnings.add("auction_row", `auction trade included (${symbol})`);
    }

    drafts.push({
      source: "zerodha_csv",
      brokerTradeId: tradeId,
      brokerOrderId: orderId,
      symbol,
      exchange: instrument.exchange,
      segment: instrument.segment,
      product: "OTHER", // Console tradebook has no MIS/CNC column (spec v1)
      side,
      quantity: quantityNum,
      pricePaise: price.paise,
      executedAt: executedAt.iso,
      underlying: instrument.underlying,
      expiry: instrument.expiry,
      strikePaise: instrument.strikePaise,
      optionType: instrument.optionType,
      raw: Object.fromEntries(headers.map((h, i) => [h, cellString(row[i])])),
    });
  });

  return { drafts, warnings: warnings.list(), rowsRead: rows.length, rowsSkipped };
}
