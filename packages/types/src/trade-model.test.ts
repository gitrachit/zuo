import { describe, expect, it } from "vitest";
import { buildInstrumentKey, EXECUTION_SOURCES, SESSION_BUCKETS } from "./index";

describe("buildInstrumentKey", () => {
  it("uses underlying+expiry+strike+optType for options", () => {
    expect(
      buildInstrumentKey({
        symbol: "NIFTY25JUL25000CE",
        underlying: "nifty",
        expiry: "2025-07-31",
        strikePaise: 2500000,
        optionType: "CE",
      }),
    ).toBe("NIFTY:2025-07-31:2500000:CE");
  });

  it("uses underlying+expiry for futures (no strike/optType)", () => {
    expect(
      buildInstrumentKey({
        symbol: "GOLDM25AUGFUT",
        underlying: "GOLDM",
        expiry: "2025-08-05",
      }),
    ).toBe("GOLDM:2025-08-05");
  });

  it("omits strike unless both strike and option type are present", () => {
    expect(
      buildInstrumentKey({
        symbol: "X",
        underlying: "NIFTY",
        expiry: "2025-07-31",
        strikePaise: 2500000,
      }),
    ).toBe("NIFTY:2025-07-31");
  });

  it("falls back to normalized symbol for equities", () => {
    expect(buildInstrumentKey({ symbol: " reliance " })).toBe("RELIANCE");
  });

  it("is deterministic regardless of underlying casing/whitespace", () => {
    const a = buildInstrumentKey({ symbol: "s", underlying: " Nifty ", expiry: "2025-07-31" });
    const b = buildInstrumentKey({ symbol: "s", underlying: "NIFTY", expiry: "2025-07-31" });
    expect(a).toBe(b);
  });
});

describe("model enums", () => {
  it("match docs/trade-model.md", () => {
    expect(EXECUTION_SOURCES).toEqual([
      "zerodha_csv",
      "zerodha_kite",
      "dhan_api",
      "manual",
      "generic_csv",
    ]);
    expect(SESSION_BUCKETS).toEqual([
      "pre_open",
      "open_15",
      "morning",
      "midday",
      "afternoon",
      "close_30",
    ]);
  });
});
