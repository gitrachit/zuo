// End-to-end importer tests against real (redacted) Console tradebooks in
// fixtures/tradebooks/ — the phase 1 exit gate. Numbers asserted here were
// cross-checked against the production import RS verified on 2026-07-19.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapTradebookRows } from "./map-executions";
import { matchExecutions } from "./match";
import { parseTradebookCsv, parseTradebookXlsx } from "./parse-file";

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

describe("fixture: eq-2024.csv (real NSE/BSE equity book)", () => {
  const { mapped, trades } = importFixture("eq-2024.csv");

  it("maps every row silently — float-artifact prices are not warnings", () => {
    expect(mapped.rowsRead).toBe(26);
    expect(mapped.drafts).toHaveLength(26);
    expect(mapped.rowsSkipped).toBe(0);
    // 139.800003 / 241.399994 style artifacts must stay silent
    expect(mapped.warnings).toEqual([]);
  });

  it("rounds float artifacts to the intended paisa", () => {
    const tata = mapped.drafts.find((d) => d.symbol === "TATASTEEL");
    expect(tata?.pricePaise).toBe(13980); // "139.800003"
    const jsw = mapped.drafts.find((d) => d.symbol === "JSWINFRA" && d.side === "BUY");
    expect(jsw?.pricePaise).toBe(24140); // "241.399994"
  });

  it("matches into 11 trades with TATASTEEL and AGI open", () => {
    expect(trades).toHaveLength(11);
    const open = trades.filter((t) => t.closedAt === null);
    expect(open.map((t) => t.instrumentKey).sort()).toEqual(["AGI", "TATASTEEL"]);
  });

  it("reproduces hand-computed P&L incl. a cross-exchange NSE→BSE close", () => {
    const jamna = trades.find((t) => t.instrumentKey === "JAMNAAUTO");
    expect(jamna?.grossPnlPaise).toBe(40750); // 163 × (125.00 − 122.50)

    // CAMS: NSE buys closed by a BSE sell (same instrumentKey) — three trades
    const cams = trades
      .filter((t) => t.instrumentKey === "CAMS")
      .map((t) => t.grossPnlPaise);
    expect(cams).toEqual([95180, 107910, -460175]);
  });
});

describe("fixture: fo-2020.csv (real NFO options book)", () => {
  const { mapped, trades } = importFixture("fo-2020.csv");

  it("maps every row with no skips and no warnings", () => {
    expect(mapped.rowsRead).toBe(263);
    expect(mapped.drafts).toHaveLength(263);
    expect(mapped.rowsSkipped).toBe(0);
    expect(mapped.warnings).toEqual([]);
  });

  it("matches into the production-verified counts (278−190 total, 4−2 open)", () => {
    expect(trades).toHaveLength(88);
    expect(trades.filter((t) => t.closedAt === null)).toHaveLength(2);
  });

  it("parses weekly NIFTY symbols and takes expiry from the column", () => {
    const nifty = mapped.drafts.find((d) => d.symbol === "NIFTY20O2212350CE");
    expect(nifty).toMatchObject({
      underlying: "NIFTY",
      expiry: "2020-10-22",
      strikePaise: 1235000,
      optionType: "CE",
      segment: "OPT",
    });
  });

  it("reproduces a hand-computed round trip", () => {
    // ICICIBANK 440CE: buy 1375 @0.70, sell 1375 @1.40 → 1375 × ₹0.70
    const icici = trades.find(
      (t) => t.instrumentKey === "ICICIBANK:2020-06-25:44000:CE",
    );
    expect(icici).toMatchObject({ direction: "LONG", quantity: 1375, grossPnlPaise: 96250 });
  });
});

describe("fixture: fo-2020.xlsx (Console XLSX export with preamble rows)", () => {
  it("skips the preamble, finds the header, and equals the CSV import", async () => {
    const { headers, rows } = await parseTradebookXlsx(
      readFileSync(join(FIXTURES, "fo-2020.xlsx")),
    );
    const xlsx = mapTradebookRows(headers, rows);
    const csv = importFixture("fo-2020.csv").mapped;
    expect(xlsx.warnings).toEqual([]);
    expect(xlsx.drafts).toHaveLength(263);
    // raw preserves each format's original cells (header casing, typed values),
    // so compare everything except raw
    const stripRaw = (drafts: typeof xlsx.drafts) =>
      drafts.map((draft) => ({ ...draft, raw: {} }));
    expect(stripRaw(xlsx.drafts)).toEqual(stripRaw(csv.drafts));
  });
});
