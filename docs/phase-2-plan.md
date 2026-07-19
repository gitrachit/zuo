# Phase 2 Plan — Charges Engine (wk 7-9)

Spec: `docs/charges-engine.md`. Goal: contract-note-exact net P&L.
Exit: computed charges match real Zerodha contract notes **to the paisa**
(equity delivery, intraday, F&O, MCX). On any mismatch: notify RS — never
adjust a fixture.

## Ground rules (from CLAUDE.md + spec)
- Pure functions in `packages/charges`; zero hardcoded rates in logic.
- Rates live in dated JSON config (`charge_rate_configs` table + bundled JSON
  fixtures); engine selects the config valid on the trade date. New
  budget/circular = new dated entry, never mutate an old one.
- All money integer paise. Rounding rules verified against contract notes,
  not assumed.
- Rates must be verified against zerodha.com/charges AT BUILD TIME (F&O STT
  changed 1 Apr 2026 — the config must carry both eras).

## PR breakdown
1. **PR A — plan + config schema + rate tables.** `ChargeRateConfig` JSON
   schema keyed by (broker, exchange, segment, product): brokerage rule
   (flat/percent/min), STT/CTT by side, exchange txn, SEBI, GST, stamp duty
   by side, DP charge. Seed `config/zerodha.json` with dated entries sourced
   from zerodha.com/charges (fetched + cited in the PR), incl. the pre/post
   2026-04-01 F&O STT split. BSE EQ scrip-group variance flagged as known
   edge (config supports override; v1 uses default group).
2. **PR B — engine core.** `computeCharges(orderLeg, config) → ChargeBreakdown`.
   NOTE: brokerage is per ORDER — engine input is executions grouped by
   (brokerOrderId, side, day); a `groupIntoOrders()` helper does this.
   Integer paise throughout; per-component rounding isolated so it can be
   tuned to match contract notes.
3. **PR C — contract-note fixtures + table tests.** RS provides redacted
   contract notes → `fixtures/contract-notes/*.json` (inputs + expected
   per-component charges). Table-driven tests must match to the paisa.
   THE phase gate. Mismatch → stop, notify RS with the diff.
4. **PR D — wire into import.** After matching, compute per-trade charges by
   allocating order-level charges across executions pro-rata by qty (rounding
   residue to the last leg so totals stay exact); fill trades.chargesPaise /
   charges / netPnlPaise. /import table gains Net P&L as primary number
   (product rule #2). Re-import recomputes.

## RS items
1. Redacted Zerodha contract notes covering: EQ delivery, EQ intraday, index
   option buy+sell, index futures, stock option, MCX GOLDM. PDF is fine —
   numbers get transcribed into fixture JSON (RS eyeballs the transcription).
2. Confirm product limitation: tradebook imports have product OTHER (no
   MIS/CNC), so v1 charges EQ as follows — symbols flat within a day are
   charged as intraday, others as delivery. This heuristic is surfaced per
   trade in the UI. RS to veto/confirm.

## Status log
- 2026-07-19 — Phase 2 opened (RS confirmed phase 1 close). PR A next.
