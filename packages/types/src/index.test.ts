import { describe, expect, it } from "vitest";
import { APP_NAME, EXCHANGES, PRODUCTS, SEGMENTS, SIDES } from "./index";

describe("@zuo/types", () => {
  it("exposes the canonical enums from docs/trade-model.md", () => {
    expect(APP_NAME).toBe("Zuo");
    expect(EXCHANGES).toContain("NSE");
    expect(EXCHANGES).toContain("MCX");
    expect(SEGMENTS).toContain("EQ");
    expect(PRODUCTS).toEqual(["MIS", "CNC", "NRML", "OTHER"]);
    expect(SIDES).toEqual(["BUY", "SELL"]);
  });
});
