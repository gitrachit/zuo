import { describe, expect, it } from "vitest";
import type { ChargeRateConfig } from "./config-schema";
import { CHARGE_CATEGORIES } from "./config-schema";
import { selectRateEntry, validateConfig, zerodhaConfig } from "./select-config";

describe("zerodha bundled config", () => {
  it("validates and covers every charge category in every era", () => {
    const config = zerodhaConfig();
    expect(config.broker).toBe("zerodha");
    for (const entry of config.entries) {
      for (const category of CHARGE_CATEGORIES) {
        expect(entry.rates[category], `${entry.effectiveFrom}/${category}`).toBeDefined();
      }
    }
  });

  it("selects the post-2026-04-01 era with the revised F&O STT", () => {
    const entry = selectRateEntry(zerodhaConfig(), "2026-07-19");
    expect(entry?.effectiveFrom).toBe("2026-04-01");
    expect(entry?.rates.FUT.stt).toEqual({ percent: 0.05, on: "sell" });
    expect(entry?.rates.OPT.stt).toEqual({ percent: 0.15, on: "sell" });
  });

  it("selects the prior era on the boundary and flags it unverified", () => {
    const entry = selectRateEntry(zerodhaConfig(), "2026-03-31");
    expect(entry?.effectiveFrom).toBe("2024-10-01");
    expect(entry?.rates.FUT.stt).toEqual({ percent: 0.02, on: "sell" });
    expect(entry?.rates.OPT.stt).toEqual({ percent: 0.1, on: "sell" });
    expect(entry?.verifiedAgainstContractNotes).toBe(false);
  });

  it("returns null for dates before any era — never a silent fallback", () => {
    expect(selectRateEntry(zerodhaConfig(), "2020-05-29")).toBeNull();
  });

  it("era boundaries are exact (inclusive from/to)", () => {
    expect(selectRateEntry(zerodhaConfig(), "2024-10-01")?.effectiveFrom).toBe("2024-10-01");
    expect(selectRateEntry(zerodhaConfig(), "2026-04-01")?.effectiveFrom).toBe("2026-04-01");
    expect(selectRateEntry(zerodhaConfig(), "2024-09-30")).toBeNull();
  });
});

describe("validateConfig", () => {
  const rates = zerodhaConfig().entries[0]!.rates;

  it("rejects overlapping eras", () => {
    const bad: ChargeRateConfig = {
      broker: "test",
      entries: [
        { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31", source: "", verifiedAgainstContractNotes: false, rates },
        { effectiveFrom: "2024-12-31", effectiveTo: null, source: "", verifiedAgainstContractNotes: false, rates },
      ],
    };
    expect(() => validateConfig(bad)).toThrow(/overlapping/);
  });

  it("rejects an open-ended era followed by another", () => {
    const bad: ChargeRateConfig = {
      broker: "test",
      entries: [
        { effectiveFrom: "2024-01-01", effectiveTo: null, source: "", verifiedAgainstContractNotes: false, rates },
        { effectiveFrom: "2025-01-01", effectiveTo: null, source: "", verifiedAgainstContractNotes: false, rates },
      ],
    };
    expect(() => validateConfig(bad)).toThrow(/overlapping/);
  });

  it("rejects inverted ranges", () => {
    const bad: ChargeRateConfig = {
      broker: "test",
      entries: [
        { effectiveFrom: "2024-06-01", effectiveTo: "2024-01-01", source: "", verifiedAgainstContractNotes: false, rates },
      ],
    };
    expect(() => validateConfig(bad)).toThrow(/inverted/);
  });
});
