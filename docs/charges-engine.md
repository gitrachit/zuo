# Charges Engine Spec (packages/charges)

Goal: contract-note-exact net P&L for Indian trades. Pure functions, zero hardcoded rates.

## Architecture
- `charge_rate_configs`: JSON rate tables, each with `effectiveFrom`/`effectiveTo` dates and
  keys by (broker, exchange, segment, product). Engine selects the config valid on trade date.
- `computeCharges(execution|trade, config) → ChargeBreakdown` (all paise, integer math,
  round per exchange/broker rules — verify rounding against contract notes, don't assume).

## Components (Zerodha, to be verified against zerodha.com/charges AT BUILD TIME — rates
below are indicative structure, not gospel; F&O STT changed 1 Apr 2026):
1. **Brokerage** — ₹0 delivery; min(₹20, 0.03%) per executed order for intraday/F&O/MCX.
   NOTE: brokerage is per ORDER, not per trade — requires order-level grouping of executions.
2. **STT/CTT** — segment + side dependent (delivery both sides; intraday sell-side;
   options on premium sell-side; futures sell-side; MCX CTT non-agri sell-side).
3. **Exchange transaction charges** — per exchange+segment (NSE/BSE/MCX differ; BSE EQ
   varies by scrip group — flag BSE scrip-group handling as a known edge case).
4. **SEBI charges** — ₹10/crore of turnover.
5. **GST** — 18% on (brokerage + exchange txn + SEBI charges).
6. **Stamp duty** — buy-side only, rate by segment (delivery vs intraday vs F&O vs MCX).
7. **DP charges** — per scrip per sell day for delivery (CNC) only, flat incl GST.

## Testing (the gate for phase 2)
- `fixtures/contract-notes/`: RS provides real Zerodha contract notes (redacted) covering:
  EQ delivery, EQ intraday, index options buy+sell, index futures, stock option, MCX GOLDM.
- Table-driven tests: engine output must equal contract note to the paisa.
- On mismatch: NOTIFY RS with the diff. Never adjust fixtures to make tests pass.

## Config change process
- New budget/circular → add a NEW dated config entry; never mutate an old one
  (historical trades must recompute identically forever).
