// End-to-end importer tests against real (redacted) Console tradebooks in
// fixtures/tradebooks/ — the phase 1 exit gate. Numbers asserted here were
// cross-checked against the production import RS verified on 2026-07-19.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapTradebookRows } from "./map-executions";
import { matchExecutions } from "./match";
import { parseTradebookCsv } from "./parse-file";

const FIXTURES = join(__dirname, "../../../fixtures/tradebooks");

function importFixture(name: string) {
  const { headers, rows } = parseTradebookCsv(readFileSync(join(FIXTURES, name), "utf8"));
  const mapped = mapTradebookRows(headers, rows);
  const trades = matchExecutions(
    mapped.drafts.map((d, i) => ({ ...d, id: String(i + 1) })),
  );
  return { mapped, trades };
}

describe("fixture: mcx-com-2025.csv (real MCX GOLDM/GOLDPETAL/SILVERM book)", () => {
  const { mapped, trades } = importFixture("mcx-com-2025.csv");

  it("maps every row with no skips and no warnings", () => {
    expect(mapped.rowsRead).toBe(459);
    expect(mapped.drafts).toHaveLength(459);
    expect(mapped.rowsSkipped).toBe(0);
    // Console pads prices to 6dp — must NOT be flagged as rounding
    expect(mapped.warnings).toEqual([]);
  });

  it("derives MCX instrument fields incl. expiry from the expiry_date column", () => {
    expect(mapped.drafts.every((d) => d.exchange === "MCX")).toBe(true);
    expect(mapped.drafts.every((d) => d.expiry !== undefined)).toBe(true);
    expect(
      mapped.drafts.every(
        (d) => d.segment === "COMMODITY_FUT" || d.segment === "COMMODITY_OPT",
      ),
    ).toBe(true);
  });

  it("matches into the verified trade counts", () => {
    expect(trades).toHaveLength(190);
    expect(trades.filter((t) => t.closedAt === null)).toHaveLength(2);
  });

  it("reproduces spot-checked trades from the verified production import", () => {
    // GOLDM Jul-25 97000 CE: LONG 20, opened 2025-07-03 11:18:33 IST, gross -₹2,160
    const goldOpt = trades.find(
      (t) =>
        t.instrumentKey === "GOLDM:2025-07-25:9700000:CE" &&
        t.direction === "LONG" &&
        t.openedAt === "2025-07-03T05:48:33.000Z",
    );
    expect(goldOpt).toMatchObject({ quantity: 20, grossPnlPaise: -216000 });

    // open GOLDM Aug futures position from 2025-07-28 09:00:48 IST
    const openFut = trades.find(
      (t) => t.instrumentKey === "GOLDM:2025-08-05" && t.closedAt === null,
    );
    expect(openFut).toMatchObject({
      direction: "LONG",
      quantity: 10,
      openedAt: "2025-07-28T03:30:48.000Z",
      grossPnlPaise: null,
    });
  });

  it("is idempotent at the mapping level (same file → identical drafts)", () => {
    const again = importFixture("mcx-com-2025.csv");
    expect(again.mapped.drafts).toEqual(mapped.drafts);
    expect(again.trades).toEqual(trades);
  });
});
