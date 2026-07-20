# Phase 4 Plan — Copilot + Auto-tagging (wk 16-21)

Spec: `docs/copilot-architecture.md`. Running on Opus (CLAUDE.md flags the
copilot tool layer for Opus). Exit: copilot answers == dashboard numbers on
100% of the eval query set. **Ship nothing if not 100%.**

## The non-negotiable (CLAUDE.md rule #1)
LLM proposes → deterministic engine computes. The model NEVER does arithmetic.
It emits structured tool calls; `packages/analytics` computes; the model
narrates the returned figures verbatim. Every numeric claim in output must
appear in a tool result (post-generation validator enforces this).

## Models (`packages/ai/models.ts`, swappable)
- Auto-tagging on import: **claude-haiku-4-5** (cheap classification).
- Copilot chat + daily debrief: **claude-sonnet-5** (tool use).
- (Project architecture names Haiku/Sonnet deliberately for cost; not Opus.)

## PR breakdown
1. **PR A — tool layer (deterministic, NO API key).** `packages/ai`: model
   router + the three tools as thin wrappers over `packages/analytics`:
   - `query_metrics({ metric[], groupBy?, filters?, dateRange? })`
   - `list_trades({ filters, sort, limit })`
   - `get_debrief_inputs({ date })`
   Pure functions + JSON-schema tool definitions + a dispatcher. Fully unit
   tested. This is the engine boundary the LLM will call — no LLM here.
2. **PR B — copilot runtime (NEEDS API KEY).** System prompt + guardrails,
   Sonnet tool-use loop over PR A's tools, the post-generation numeric
   validator (scan response numbers against tool results; mismatch →
   regenerate once, then fail gracefully). Prompt-injection: wrap tool results
   in delimiters, trade notes/symbols are data not instructions.
3. **PR C — auto-tagging on import (NEEDS API KEY).** Haiku classifies
   setupTag + sessionBucket sanity on import; writes `trades.setup_tag`.
4. **PR D — chat UI + eval gate (NEEDS API KEY).** `/copilot` chat surface
   (parchment-gold AI voice per design-notes — first use of `--coach`).
   `evals/copilot-queries.json` (≥40 Qs, RS-seeded). Ship only at 100%.

## RS items (BLOCKING for PR B onward)
1. **ANTHROPIC_API_KEY** — create an Anthropic API key, add it to Vercel env
   (server-side only, NOT `NEXT_PUBLIC_`) and local `.env.local`. Without it,
   PRs B–D can't run or be verified. PR A does not need it.
2. Seed `evals/copilot-queries.json` with real questions + expected engine
   outputs (RS knows the real usage patterns). The 100% gate needs this.

## Regulatory guardrail (CLAUDE.md rule #3)
No advice, no signals, no predictions — SEBI boundary. System prompt forbids
it; anything resembling a buy/sell recommendation is refused. The copilot
only analyzes the user's own past trades + general concepts.

## Status log
- 2026-07-19 — Phase 4 opened (RS confirmed after phase 3 close). PR A
  (deterministic tool layer) in progress; API key flagged as blocking for B+.
