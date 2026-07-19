import { describe, expect, it } from "vitest";
import {
  istToUtc,
  mapTradebookRows,
  rupeesToPaise,
  toIsoDate,
} from "./map-executions";
import { parseTradebookCsv } from "./parse-file";

const HEADERS =
  "symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time";

function mapCsv(csv: string) {
  const { headers, rows } = parseTradebookCsv(csv);
  return mapTradebookRows(headers, rows);
}

describe("mapTradebookRows — EQ", () => {
  it("maps a delivery buy row", () => {
    const result = mapCsv(
      `${HEADERS}\n` +
        `RELIANCE,INE002A01018,2025-07-03,NSE,EQ,EQ,buy,false,10,1450.75,T001,O001,2025-07-03T09:15:32`,
    );
    expect(result.rowsRead).toBe(1);
    expect(result.rowsSkipped).toBe(0);
    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0];
    expect(draft).toMatchObject({
      source: "zerodha_csv",
      symbol: "RELIANCE",
      exchange: "NSE",
      segment: "EQ",
      product: "OTHER",
      side: "BUY",
      quantity: 10,
      pricePaise: 145075,
      brokerTradeId: "T001",
      brokerOrderId: "O001",
    });
    // 09:15:32 IST == 03:45:32 UTC
    expect(draft?.executedAt).toBe("2025-07-03T03:45:32.000Z");
    expect(draft?.underlying).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("keeps the original row in raw", () => {
    const result = mapCsv(
      `${HEADERS}\nRELIANCE,INE002A01018,2025-07-03,NSE,EQ,EQ,buy,false,10,1450.75,T001,O001,2025-07-03T09:15:32`,
    );
    expect(result.drafts[0]?.raw["trade_id"]).toBe("T001");
    expect(result.drafts[0]?.raw["isin"]).toBe("INE002A01018");
  });
});

describe("mapTradebookRows — derivatives", () => {
  it("maps an NFO weekly option sell with symbol-derived expiry", () => {
    const result = mapCsv(
      `${HEADERS}\nNIFTY2570325000CE,,2025-07-03,NFO,FO,,sell,false,75,120.5,T002,O002,2025-07-03T10:00:00`,
    );
    expect(result.drafts[0]).toMatchObject({
      symbol: "NIFTY2570325000CE",
      exchange: "NFO",
      segment: "OPT",
      side: "SELL",
      quantity: 75,
      pricePaise: 12050,
      underlying: "NIFTY",
      expiry: "2025-07-03",
      strikePaise: 2500000,
      optionType: "CE",
    });
    expect(result.warnings).toEqual([]);
  });

  it("prefers the expiry_date column over the symbol for monthly contracts", () => {
    const headers = `${HEADERS},expiry_date`;
    const result = mapCsv(
      `${headers}\nGOLDM25AUGFUT,,2025-07-03,MCX,COM,,buy,false,10,72500.00,T003,O003,2025-07-03T14:30:00,2025-08-05`,
    );
    expect(result.drafts[0]).toMatchObject({
      exchange: "MCX",
      segment: "COMMODITY_FUT",
      underlying: "GOLDM",
      expiry: "2025-08-05",
    });
    expect(result.warnings).toEqual([]);
  });

  it("warns when a monthly derivative has no expiry source", () => {
    const result = mapCsv(
      `${HEADERS}\nNIFTY25JUL25000CE,,2025-07-03,NFO,FO,,buy,false,75,80.00,T004,O004,2025-07-03T11:00:00`,
    );
    expect(result.drafts[0]?.expiry).toBeUndefined();
    expect(result.warnings.map((w) => w.code)).toContain("expiry_unknown");
  });

  it("imports unparseable derivative symbols with a warning (matching falls back to symbol)", () => {
    const result = mapCsv(
      `${HEADERS}\nWEIRDSYM,,2025-07-03,NFO,FO,,buy,false,50,10.00,T005,O005,2025-07-03T11:00:00`,
    );
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.underlying).toBeUndefined();
    expect(result.warnings.map((w) => w.code)).toContain("unparseable_derivative_symbol");
  });
});

describe("mapTradebookRows — tolerance and errors", () => {
  it("handles shuffled column order and header case drift", () => {
    const result = mapCsv(
      `Price,Trade Type,SYMBOL,quantity,trade_id,order_id,exchange,segment,trade_date\n` +
        `99.5,BUY,TCS,5,T010,O010,NSE,EQ,2025-07-04`,
    );
    expect(result.drafts[0]).toMatchObject({
      symbol: "TCS",
      side: "BUY",
      pricePaise: 9950,
      quantity: 5,
    });
    // no order_execution_time column → midnight-IST fallback warning
    expect(result.warnings.map((w) => w.code)).toContain("execution_time_missing");
  });

  it("surfaces unknown columns as a warning without dropping data", () => {
    const result = mapCsv(
      `${HEADERS},mystery_col\nRELIANCE,,2025-07-03,NSE,EQ,EQ,buy,false,1,100.00,T011,O011,2025-07-03T09:20:00,huh`,
    );
    expect(result.drafts).toHaveLength(1);
    const unmapped = result.warnings.find((w) => w.code === "unmapped_columns");
    expect(unmapped?.message).toContain("mystery_col");
  });

  it("refuses files missing required columns", () => {
    const result = mapCsv(`symbol,price\nRELIANCE,100.00`);
    expect(result.drafts).toHaveLength(0);
    expect(result.rowsSkipped).toBe(1);
    expect(result.warnings.map((w) => w.code)).toContain("missing_required_columns");
  });

  it("skips bad rows individually and aggregates duplicate warnings", () => {
    const result = mapCsv(
      `${HEADERS}\n` +
        `RELIANCE,,2025-07-03,NSE,EQ,EQ,hold,false,1,100.00,T012,O012,2025-07-03T09:20:00\n` +
        `RELIANCE,,2025-07-03,NSE,EQ,EQ,hold,false,1,100.00,T013,O013,2025-07-03T09:21:00\n` +
        `TCS,,2025-07-03,NSE,EQ,EQ,buy,false,2,50.00,T014,O014,2025-07-03T09:22:00`,
    );
    expect(result.drafts).toHaveLength(1);
    expect(result.rowsSkipped).toBe(2);
    const bad = result.warnings.filter((w) => w.code === "bad_row");
    expect(bad).toHaveLength(2); // different row numbers → separate messages
  });

  it("produces identical drafts for identical rows (DB dedupe key does the rest)", () => {
    const row = `RELIANCE,,2025-07-03,NSE,EQ,EQ,buy,false,1,100.00,T015,O015,2025-07-03T09:20:00`;
    const result = mapCsv(`${HEADERS}\n${row}\n${row}`);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]).toEqual(result.drafts[1]);
    expect(result.drafts[0]?.brokerTradeId).toBe("T015");
  });
});

describe("cell helpers", () => {
  it("rupeesToPaise: string math, rounding flagged", () => {
    expect(rupeesToPaise("1450.75")).toEqual({ paise: 145075, rounded: false });
    expect(rupeesToPaise("83.5")).toEqual({ paise: 8350, rounded: false });
    expect(rupeesToPaise(72500)).toEqual({ paise: 7250000, rounded: false });
    expect(rupeesToPaise("83.5625")).toEqual({ paise: 8356, rounded: true });
    expect(rupeesToPaise("83.559")).toEqual({ paise: 8356, rounded: true });
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
  });

  it("toIsoDate: ISO, DD-MM-YYYY, DD/MM/YYYY, Date", () => {
    expect(toIsoDate("2025-07-31")).toBe("2025-07-31");
    expect(toIsoDate("2025-07-31 00:00:00")).toBe("2025-07-31");
    expect(toIsoDate("31-07-2025")).toBe("2025-07-31");
    expect(toIsoDate("31/07/2025")).toBe("2025-07-31");
    expect(toIsoDate(new Date("2025-07-31T00:00:00Z"))).toBe("2025-07-31");
    expect(toIsoDate("July 31")).toBeNull();
  });

  it("istToUtc converts +05:30", () => {
    expect(istToUtc("2025-07-03", "09:15:32")).toBe("2025-07-03T03:45:32.000Z");
    expect(istToUtc("2025-07-03")).toBe("2025-07-02T18:30:00.000Z");
  });
});
