# Zuo — AI Trading Journal + Copilot

India-native trading journal (Zerodha/Dhan, NSE/BSE/MCX) with an AI copilot.
Solo founder (RS). You (Claude Code) are the primary builder. Read PLAN.md for phases.

## Model & escalation policy (IMPORTANT)
- Architecture, data-model changes, charges engine, copilot tool layer, multi-file refactors → run in **plan mode** and ask RS to switch to **Opus** (`/model opus`) before executing.
- Routine implementation, UI, tests, CRUD → **Sonnet** (default).
- If a task exceeds your capability, requires credentials/accounts/approvals, needs a human decision, or you are uncertain after 2 attempts → **STOP and notify RS** with a clear summary of what's blocked and what you need. Never fake, stub silently, or work around a blocker without flagging it.

## Non-negotiable product rules
1. **LLM proposes → deterministic engine computes.** The copilot NEVER computes P&L, win rate, expectancy, or any number. It emits structured tool calls; `packages/analytics` computes; the LLM narrates the returned figures verbatim.
2. **Net P&L is always charges-aware.** Never display gross-only P&L as the primary number.
3. **No advice, no signals, ever.** Zuo analyzes the user's own past trades. Any feature resembling a buy/sell recommendation is a SEBI regulatory boundary — refuse and notify RS.
4. Charges rates are **config-driven and dated** (see docs/charges-engine.md). Never hardcode a rate in logic.

## Repo layout (Turborepo)
- `apps/web` — Next.js 15 (App Router), Tailwind. Public site + dashboard.
- `apps/mobile` — Expo (phase: post-web-launch; scaffold only until then).
- `apps/api` — Go (chi) service: ingestion, sync jobs, debrief batch. May start as Next.js route handlers; extract to Go when jobs need scheduling.
- `packages/types` — canonical trade model (docs/trade-model.md is the source of truth).
- `packages/charges` — Indian charges engine (pure functions, config in JSON).
- `packages/analytics` — deterministic metrics engine (pure functions).
- `packages/api-client` — typed client shared by web/mobile.
- DB: Supabase Postgres. Auth: Supabase Auth. Billing: Razorpay (India) + Stripe (global), phase 7.

## Conventions
- TypeScript strict; no `any` without a `// why` comment.
- Pure functions in packages/*; side effects only in apps/*.
- Money: integers in paise (India) / cents (global). Never floats for money.
- Timestamps: store UTC, display IST (Asia/Kolkata) by default.
- Every packages/* function ships with unit tests. Charges + analytics require table-driven tests against fixtures in `fixtures/`.
- Touch only what the task asks for. No drive-by refactors.
- Commit style: `feat|fix|chore(scope): message`. Small, reviewable commits.

## Testing gates
- `pnpm turbo test lint typecheck` must pass before any commit.
- Charges engine: must match the real Zerodha contract-note fixtures to the paisa. If a fixture mismatch appears, do not "fix" the fixture — notify RS.

## Current phase
See PLAN.md. Do not start a later phase's work early without RS's confirmation.
