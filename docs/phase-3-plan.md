# Phase 3 Plan — Analytics Engine + Dashboard (wk 10-15)

PLAN.md exit: dashboard numbers match hand-computed fixtures; time-to-first-insight
from signup+CSV < 5 min. Design: `docs/design-notes.md`.

## Ground rules
- `packages/analytics` = pure functions, deterministic, every function unit-tested
  against hand-computed fixtures. This is the engine the copilot will call in
  phase 4 (CLAUDE.md rule #1: LLM proposes → engine computes). It must be the
  single source of every number.
- **Net-after-charges is the primary P&L** (rule #2). Metrics classify wins/losses
  and aggregate on `netPnlPaise`. Trades with null net P&L (uncovered charge era,
  or still open) are NOT silently mixed in — the app filters to charge-known
  closed trades and reports the excluded count. Analytics input requires
  `netPnlPaise: number`.
- Money integer paise; ratios are numbers or null (never guessed, e.g. profit
  factor with zero losses = null, expectancy_R with no user risk = null).

## PR breakdown
1. **PR A — metrics core.** `computeMetrics(trades) → Metrics`: trade count,
   wins/losses/breakeven, win rate, net/gross/charges totals, avg win/avg loss,
   largest win/loss, profit factor, expectancy (per-trade net), expectancy_R,
   max drawdown (on cumulative net equity curve), avg hold. Hand-computed tests.
2. **PR B — slicing + series.** `groupBy` (setup | instrument | session_bucket |
   day_of_week | expiry_day | product | direction) → per-bucket Metrics; date-range
   + dimension filters; equity curve series (cumulative net by closedAt) and
   drawdown series; day-level calendar aggregation (net per IST day).
3. **PR C — dashboard data layer.** Server route/query: fetch user's closed
   charge-known trades, run analytics, return a typed bundle (headline metrics +
   equity curve + calendar + recent trades + excluded counts). Thin wrapper over
   packages/analytics — no metric math in the app.
4. **PR D — dashboard UI** (`/dashboard`) per design-notes: tokens (jade/sienna,
   parchment-gold reserved for AI, Plex Mono numbers), equity curve, stat tiles
   (net P&L primary), calendar heatmap, trade list, slice selector. Clean > dense.
   Honest empty/partial states (charges-unknown banner). `/import` links here.

## Exit checklist
- [ ] analytics fixtures: every metric hand-verified, table-driven
- [ ] dashboard headline numbers == analytics fixtures (verified in-browser)
- [ ] equity curve + calendar render from RS's real imported trades
- [ ] charges-unknown trades excluded from net metrics, count surfaced
- [ ] RS signs off; TTFI (signup+CSV→first insight) < 5 min

## Status log
- 2026-07-19 — Phase 3 opened (RS: "go phase 3"; running on Opus per escalation
  policy for analytics engine). PR A next.
