# Phase 1 Plan — Trade Model + Zerodha Console Importer (wk 3-6)

Spec: `docs/phase-1-spec.md`. Source of truth for the model: `docs/trade-model.md`.
Exit: real RS tradebook imports cleanly; round-trips match manual verification;
importer test suite green.

## PR breakdown (each PR: gate green → CI → squash-merge)

1. **PR A — model + schema** (this PR)
   - `packages/types`: full `Execution`, `Trade`, `ChargeBreakdown` interfaces +
     `buildInstrumentKey()` normalizer, per docs/trade-model.md. Unit tests.
   - `supabase/migrations/20260719120000_trade_model.sql`: broker_accounts,
     executions, trades, charge_rate_configs, tags, debriefs. All money bigint
     paise; unique index executions(broker_account_id, broker_trade_id); RLS on
     user_id for user tables; charge_rate_configs readable by all authenticated,
     writable only via service role.
2. **PR B — symbol parser** — `parseTradingSymbol()` for NFO/BFO options+futures
   and MCX (NIFTY25JUL25000CE, GOLDM25AUGFUT, …) → underlying/expiry/strike/
   optionType. Table-driven tests for both grammars, incl. weekly-expiry forms.
3. **PR C — tradebook file parsing** — CSV (papaparse) + XLSX (SheetJS or
   exceljs), tolerant header mapping, row → `Execution` mapping (product:
   'OTHER' per spec). Unknown-column → warning surfaced, never dropped silently.
4. **PR D — FIFO matcher** — executions → `Trade`s per (user, account,
   instrumentKey, product); partial fills, scale-in/out, open positions at range
   edges. Gross P&L from summed execution notionals (exact integer paise);
   avg prices rounded to the paisa for display only.
5. **PR E — ingestion + /import UI** — upload route handler (parse → dedupe →
   insert → match → summary), drag-drop page, import summary incl. the
   product-unknown limitation flag, plain trades table.
6. **PR F — real-fixture hardening** — RS's redacted tradebooks in
   `fixtures/tradebooks/`; end-to-end assertions (counts, matching, idempotent
   re-import). This PR is the phase gate.

## Architecture decisions (flagging per CLAUDE.md)

- **New package `packages/importer`** (not in CLAUDE.md's original layout):
  pure functions for header mapping, symbol parsing, row mapping, FIFO matching.
  Rationale: this logic is broker-format-specific and shared by web ingestion
  now + Go api later; it is neither analytics nor charges. Side effects (DB
  writes, uploads) stay in `apps/web` route handlers. **RS: veto if you'd
  rather fold this into packages/analytics.**
- Ingestion runs as Next.js route handlers (per CLAUDE.md: Go api extracted
  only when jobs need scheduling — not yet).
- Trades are re-derivable: matcher may delete+rebuild trades for an
  (account, instrumentKey) scope on re-import; executions are never mutated.

## RS items

1. **Apply the migration**: Supabase dashboard → SQL Editor → paste
   `supabase/migrations/20260719120000_trade_model.sql` → Run. (Alternative:
   `supabase link` + `db push` locally. Claude has no DB credentials — the anon
   key can't run DDL, by design.)
2. **Tradebook fixtures** into `fixtures/tradebooks/` (redacted client IDs):
   EQ delivery multi-day, EQ intraday scale-in/out, NIFTY options same-day,
   MCX GOLDM overnight — CSV and XLSX.
3. Kite Connect approval emails (carried over; phase 6 long pole).

## Status log
- 2026-07-19 — Phase 1 started (RS confirmed). PR A in flight.
- 2026-07-19 — PRs A–E merged. Full flow live on production: auth (email/password
  + confirmation callback), /api/import, /import UI. E2E-verified in headless
  Chromium against live Supabase incl. idempotent re-import.
- 2026-07-19 — RS imported a REAL MCX tradebook on production: 459 rows → 459
  executions → 190 trades, 2 open. File committed as
  fixtures/tradebooks/mcx-com-2025.csv with end-to-end tests pinning those
  numbers. Fixed: Console pads prices to 6dp — no longer false-flagged as
  rounding. Remaining for exit: EQ + NFO fixtures (RS), XLSX variant, RS's
  manual verification that matched round-trips look right.
- NOTE for phase 8 (SMTP): Supabase built-in email is ~2-4/hr — wire custom
  SMTP (e.g. Resend) before beta signups.
- 2026-07-19 — EQ + NFO CSV and F&O XLSX fixtures added (PRs #10, #11). Two
  real-file bugs fixed: Console XLSX preamble/headerless-expiry-column, and
  float-artifact price warnings. XLSX re-import verified on production
  (263 duplicates, 0 new, no warnings).
- 2026-07-19 — **PHASE 1 CLOSED.** RS verified matched trades against records
  ("looks right"). Exit criteria met: real tradebooks (MCX/EQ/NFO, CSV+XLSX)
  import cleanly, round-trips verified, importer suite green (114 tests).
