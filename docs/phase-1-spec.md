# Phase 1 Spec — Zerodha Console Tradebook Importer

The first real feature. Everything else builds on this. Work in plan mode first.

## Input
- Zerodha Console → Reports → Tradebook export (CSV and XLSX), any date range,
  segments: EQ, F&O (NFO), MCX. RS will provide real files in `fixtures/tradebooks/`
  (redacted client IDs). Expect columns like: symbol, isin, trade_date, exchange,
  segment, series, trade_type, auction, quantity, price, trade_id, order_id,
  order_execution_time. Column names/casing may drift between exports — build a
  tolerant header-mapping layer, and NOTIFY RS if an unmapped column appears.

## Pipeline
1. Parse file (CSV via papaparse-equivalent server-side; XLSX via a maintained lib).
2. Map rows → Execution records (see docs/trade-model.md). Derive segment/product:
   - Console tradebook does NOT include product (MIS/CNC) — mark `product: 'OTHER'`
     in v1 and treat intraday-flat symbols per day as MIS-like for analytics.
     Flag this limitation in the import summary UI.
   - Parse derivative symbols (NIFTY25JUL25000CE, GOLDM25AUGFUT) → underlying,
     expiry, strike, optionType. Symbol grammar differs NFO vs MCX — test both.
3. Dedupe: skip executions whose (brokerAccountId, brokerTradeId) already exist.
   Re-importing the same file twice must be a no-op.
4. Run FIFO matcher → Trades (open positions allowed at range edges).
5. Import summary: N rows read, N new executions, N duplicates, N trades formed,
   N open positions, warnings list.

## UI (minimal)
- /import page: drag-drop file → progress → summary → link to dashboard (dashboard
  itself is phase 3; a plain trades table is enough here).

## Tests (exit gate)
- Fixture files: EQ delivery multi-day, EQ intraday scale-in/out, NIFTY options
  same-day round trips, MCX GOLDM overnight, file with duplicate rows, file with
  shuffled column order.
- Assertions: execution counts, trade matching (entries/exits/qty/avg prices),
  idempotent re-import, symbol parsing (expiry/strike/optionType exact).

## Explicitly out of scope (do not build)
- Kite/Dhan API sync (phase 6), charges (phase 2), analytics (phase 3),
  strategy-leg grouping, manual trade entry forms.
