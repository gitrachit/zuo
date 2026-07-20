import { describe, expect, it } from "vitest";
import { istDate, istWeekday } from "./ist";

describe("ist helpers", () => {
  it("converts UTC to IST calendar date across the +5:30 boundary", () => {
    // 2025-01-01 20:00 UTC = 2025-01-02 01:30 IST
    expect(istDate("2025-01-01T20:00:00Z")).toBe("2025-01-02");
    // 2025-01-01 10:00 UTC = 2025-01-01 15:30 IST
    expect(istDate("2025-01-01T10:00:00Z")).toBe("2025-01-01");
  });

  it("labels IST weekday (2025-01-01 is a Wednesday)", () => {
    expect(istWeekday("2025-01-01T10:00:00Z")).toBe("Wed");
    // late-evening UTC that rolls into Thursday IST
    expect(istWeekday("2025-01-01T20:00:00Z")).toBe("Thu");
    // 2024-12-31 20:00 UTC = 2025-01-01 01:30 IST → Wed
    expect(istWeekday("2024-12-31T20:00:00Z")).toBe("Wed");
  });
});
