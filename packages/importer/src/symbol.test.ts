import { describe, expect, it } from "vitest";
import { parseTradingSymbol, strikeToPaise } from "./symbol";

describe("parseTradingSymbol — futures (NFO + MCX grammar)", () => {
  it.each([
    ["NIFTY25JULFUT", "NIFTY", 2025, 7],
    ["BANKNIFTY25AUGFUT", "BANKNIFTY", 2025, 8],
    ["GOLDM25AUGFUT", "GOLDM", 2025, 8],
    ["CRUDEOIL26JANFUT", "CRUDEOIL", 2026, 1],
    ["USDINR25DECFUT", "USDINR", 2025, 12],
    ["M&M25JULFUT", "M&M", 2025, 7],
    ["360ONE25JULFUT", "360ONE", 2025, 7],
  ])("%s", (symbol, underlying, year, month) => {
    expect(parseTradingSymbol(symbol)).toEqual({
      underlying,
      kind: "FUT",
      expiryYear: year,
      expiryMonth: month,
      expiryDay: null,
    });
  });
});

describe("parseTradingSymbol — monthly options", () => {
  it.each([
    ["NIFTY25JUL25000CE", "NIFTY", 2025, 7, 2500000, "CE"],
    ["BANKNIFTY25AUG52000PE", "BANKNIFTY", 2025, 8, 5200000, "PE"],
    ["CRUDEOIL25JUL6500CE", "CRUDEOIL", 2025, 7, 650000, "CE"],
    ["RELIANCE26FEB3000PE", "RELIANCE", 2026, 2, 300000, "PE"],
    ["USDINR25JUL83.5CE", "USDINR", 2025, 7, 8350, "CE"],
    ["USDINR25JUL83.25PE", "USDINR", 2025, 7, 8325, "PE"],
  ])("%s", (symbol, underlying, year, month, strikePaise, optionType) => {
    expect(parseTradingSymbol(symbol)).toEqual({
      underlying,
      kind: "OPT",
      expiryYear: year,
      expiryMonth: month,
      expiryDay: null,
      strikePaise,
      optionType,
    });
  });
});

describe("parseTradingSymbol — weekly options (digit + OND month codes)", () => {
  it.each([
    // NIFTY 2025 Jul 03, strike 25000
    ["NIFTY2570325000CE", "NIFTY", 2025, 7, 3, 2500000, "CE"],
    // Oct/Nov/Dec letter codes
    ["NIFTY25O0725500PE", "NIFTY", 2025, 10, 7, 2550000, "PE"],
    ["NIFTY25N2524000CE", "NIFTY", 2025, 11, 25, 2400000, "CE"],
    ["NIFTY25D3024000CE", "NIFTY", 2025, 12, 30, 2400000, "CE"],
    // BSE weekly (SENSEX), Sep 11 2025
    ["SENSEX2591181000CE", "SENSEX", 2025, 9, 11, 8100000, "CE"],
    // underlying ending in digits still splits correctly
    ["360ONE2570325000CE", "360ONE", 2025, 7, 3, 2500000, "CE"],
  ])("%s", (symbol, underlying, year, month, day, strikePaise, optionType) => {
    expect(parseTradingSymbol(symbol)).toEqual({
      underlying,
      kind: "OPT",
      expiryYear: year,
      expiryMonth: month,
      expiryDay: day,
      strikePaise,
      optionType,
    });
  });
});

describe("parseTradingSymbol — non-derivatives and malformed input", () => {
  it.each([
    "RELIANCE",
    "TCS",
    "IDEA", // ends in EA, not CE/PE
    "GOLDBEES", // equity ETF ending in ES
    "25JULFUT", // empty underlying
    "NIFTYJULFUT", // missing year digits
    "NIFTY25XXX25000CE", // bad month, and no valid weekly split
    "", // empty
  ])("%s → null", (symbol) => {
    expect(parseTradingSymbol(symbol)).toBeNull();
  });

  it("prunes weekly splits implying absurd years", () => {
    // Only valid split is NIFTY|25|7|03|25000 — alternatives imply year 2070 etc.
    const parsed = parseTradingSymbol("NIFTY2570325000CE");
    expect(parsed?.expiryYear).toBe(2025);
    expect(parsed?.strikePaise).toBe(2500000);
  });

  it("normalizes case and whitespace", () => {
    expect(parseTradingSymbol(" nifty25julfut ")).toEqual(
      parseTradingSymbol("NIFTY25JULFUT"),
    );
  });
});

describe("strikeToPaise", () => {
  it.each([
    ["25000", 2500000],
    ["83.5", 8350],
    ["83.25", 8325],
    ["0", 0],
  ])("%s → %d", (input, expected) => {
    expect(strikeToPaise(input)).toBe(expected);
  });

  it("rejects malformed strikes", () => {
    expect(strikeToPaise("83.255")).toBeNull(); // sub-paisa
    expect(strikeToPaise("83.")).toBeNull();
    expect(strikeToPaise(".5")).toBeNull();
    expect(strikeToPaise("8a3")).toBeNull();
  });
});
