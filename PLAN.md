# Zuo — Build Plan (v1, Jul 2026)

Solo founder + Claude Code. Web-first (Next.js PWA) → Expo mobile fast-follow.
Each phase has exit criteria. Do not advance until they pass and RS confirms.

## Phase 0 — Repo & infra (wk 1-2)
- Turborepo scaffold per CLAUDE.md layout; Supabase project (auth + Postgres); CI (GitHub Actions: test/lint/typecheck); deploy web to Vercel.
- Exit: hello-world web deployed; shared type imported by web + mobile shell; CI green.

## Phase 1 — Trade model + Zerodha Console CSV import (wk 3-6)
- Implement docs/trade-model.md schema (types + SQL migration).
- Console tradebook CSV/XLSX importer → executions → FIFO round-trip matching → trades. Multi-leg F&O grouping. Idempotent re-import (dedupe on trade_id/order_id).
- Spec: docs/phase-1-spec.md. Exit: real RS tradebook imports cleanly; round-trips match manual verification; importer test suite green.

## Phase 2 — Charges engine (wk 7-9)  [Opus, plan mode]
- packages/charges per docs/charges-engine.md. Config-driven, dated rate tables.
- Exit: computed charges match real Zerodha contract-note fixtures to the paisa (equity delivery, intraday, F&O, MCX cases).

## Phase 3 — Analytics engine + dashboard (wk 10-15)
- packages/analytics: win rate, expectancy, R-multiples, profit factor, max drawdown, avg win/loss; slicing by setup/instrument/time-of-day/day-of-week/expiry-vs-non-expiry/MIS-vs-CNC.
- Dashboard UI per docs/design-notes.md (equity curve, stats, calendar, trade list). Clean > dense.
- Exit: dashboard numbers match hand-computed fixtures; time-to-first-insight from signup+CSV < 5 min.

## Phase 4 — Copilot + auto-tagging (wk 16-21)  [Opus for tool layer]
- Tool layer per docs/copilot-architecture.md. Haiku auto-tagging on import; Sonnet copilot with tools over packages/analytics.
- Exit: copilot answers == dashboard numbers on 100% of the eval query set. Ship nothing if not 100%.

## Phase 5 — Daily debrief (wk 22-25)
- Post-close batch job (Batch API, prompt-cached): per-user narrative debrief from engine outputs. Web notification; email fallback.
- Exit: debriefs generate for all active users after close; numbers sourced from engine only.

## Phase 6 — Live broker sync (wk 26-30)
- Dhan API auto-sync (primary). Zerodha login-redirect current-day sync. Honest UX copy about Zerodha's daily-login limitation.
- NOTE (RS, not Claude Code): email kiteconnect@zerodha.com + talk@rainmatter.com for multi-user approval — start NOW, it's the long pole.
- Exit: connect Dhan and/or Zerodha → today's trades appear without CSV.

## Phase 7 — Billing (wk 31-33)
- Razorpay UPI AutoPay subscriptions ₹499/mo (₹1 mandate auth); Stripe $19-39/mo. Free tier, no card for trial. Self-serve cancel.
- Exit: end-to-end live subscription + cancel on both rails.

## Phase 8 — Private beta (wk 34-38)
- 30-100 Indian F&O traders from waitlist. Instrument sync success rate + time-to-first-insight.
- Exit: sync success >95%; TTFI <5 min; ≥40% "would pay".

## Phase 9 — India public launch (wk 39-44)
- Product Hunt/Peerlist, r/IndianStreetBets, TradingQnA, fintwit. Annual discount.
- Post-launch: Expo app (debrief push) after >30% wk-4 retention; global (IBKR + generic CSV) after ~1,000 paying India users.

## Standing rules
- Skip at launch: trade replay, backtesting, prop-firm sync, community, education.
- AI is included, never credit-metered.
- Anything blocked or beyond capability → notify RS (see CLAUDE.md escalation policy).
