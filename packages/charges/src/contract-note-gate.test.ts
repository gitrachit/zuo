// THE phase 2 gate (docs/charges-engine.md): engine output must equal contract
// notes to the paisa. On mismatch: notify RS — never adjust the fixture.
//
// Current pack (fixtures/contract-notes/synthetic-pack-001.json) is SYNTHETIC
// (self-describing tariffs), so it gates the ENGINE MATH — aggregation and
// rounding — not the Zerodha rate tables. Real notes must still verify
// config/zerodha.json eras before verifiedAgainstContractNotes flips true.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeNoteCharges } from "./compute-note";
import { totalPaise, type OrderLeg } from "./compute";
import type { BrokerageRule, CategoryRates } from "./config-schema";

interface FixtureTrade {
  order_id: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
}

interface Fixture {
  id: string;
  trade_date: string;
  segment: string;
  trades: FixtureTrade[];
  computed: {
    charges: Record<string, number>;
    total_charges: number;
  };
  tariff: Record<string, string>;
}

const pack = JSON.parse(
  readFileSync(join(__dirname, "../../../fixtures/contract-notes/synthetic-pack-001.json"), "utf8"),
) as { fixtures: Fixture[] };

const rupees = (value: number): number => Math.round(value * 100);
/** tariff rates are decimal fractions ("0.0003" = 0.03%) */
const percent = (tariff: Record<string, string>, key: string): number =>
  Number(tariff[key] ?? 0) * 100;

function ratesFromTariff(tariff: Record<string, string>): CategoryRates {
  let brokerage: BrokerageRule;
  if (tariff.brokerage_type === "zero") brokerage = { type: "zero" };
  else if (tariff.brokerage_type === "flat") {
    brokerage = { type: "flatPerOrder", paise: rupees(Number(tariff.brokerage_flat)) };
  } else {
    brokerage = {
      type: "percentCappedPerOrder",
      percent: percent(tariff, "brokerage_rate"),
      capPaise: rupees(Number(tariff.brokerage_cap)),
    };
  }
  const sttBuy = percent(tariff, "stt_buy_rate");
  const sttSell = percent(tariff, "stt_sell_rate") || percent(tariff, "ctt_sell_rate");
  const stt =
    sttBuy > 0 && sttSell > 0
      ? ({ percent: sttSell, on: "both" } as const)
      : sttSell > 0
        ? ({ percent: sttSell, on: "sell" } as const)
        : undefined;
  return {
    brokerage,
    stt,
    exchangeTxnPercent: { NOTE: percent(tariff, "exchange_rate") },
    sebiPerCroreRupees: Number(tariff.sebi_rate) * 1e7,
    gstPercent: 18,
    stampDuty: { percent: percent(tariff, "stamp_buy_rate"), on: "buy" },
  };
}

function legsFrom(fixture: Fixture): OrderLeg[] {
  return fixture.trades.map((t) => ({
    category: "EQ_INTRADAY" as const, // category label is irrelevant here; rates are explicit
    exchange: "NOTE",
    side: t.side,
    turnoverPaise: t.qty * rupees(t.price),
    tradeDate: fixture.trade_date,
  }));
}

describe("contract-note gate: engine must match each note to the paisa", () => {
  for (const fixture of pack.fixtures) {
    it(fixture.id, () => {
      const computed = computeNoteCharges(legsFrom(fixture), ratesFromTariff(fixture.tariff));
      const expected = fixture.computed.charges;
      expect(computed.brokerage, "brokerage").toBe(rupees(expected.brokerage ?? 0));
      // fixture splits stt/ctt; the model carries one stt field
      expect(computed.stt, "stt+ctt").toBe(rupees((expected.stt ?? 0) + (expected.ctt ?? 0)));
      expect(computed.exchangeTxn, "exchangeTxn").toBe(
        rupees(expected.exchange_transaction_charges ?? 0),
      );
      expect(computed.sebi, "sebi").toBe(rupees(expected.sebi_charges ?? 0));
      expect(computed.gst, "gst").toBe(rupees(expected.gst ?? 0));
      expect(computed.stampDuty, "stampDuty").toBe(rupees(expected.stamp_duty ?? 0));
      expect(totalPaise(computed), "total").toBe(rupees(fixture.computed.total_charges));
    });
  }
});
