# Copilot Architecture (phase 4)

Rule #1 (from CLAUDE.md): **LLM proposes → deterministic engine computes.**
The model never does arithmetic. It selects tools; packages/analytics returns exact
numbers; the model narrates them verbatim (paise-accurate, IST dates).

## Runtime models
- Auto-tagging on import: **Haiku** (cheap classification: setupTag, sessionBucket sanity).
- Copilot chat + daily debrief: **Sonnet** (tool use). Debrief runs via Batch API,
  prompt-cached system prompt, after MCX close.
- Model IDs live in one `packages/ai/models.ts` router — swappable without code changes.

## Tools (exposed to the LLM)
- `query_metrics({ metric[], groupBy?, filters?, dateRange })`
  metrics: win_rate, expectancy_r, profit_factor, net_pnl, gross_pnl, charges_total,
  avg_win, avg_loss, max_drawdown, trade_count, hold_time_avg
  groupBy: setup | instrument | session_bucket | day_of_week | expiry_day | product
  filters: instrumentKey, segment, product, setupTag, direction, expiry_day
- `list_trades({ filters, sort, limit })` — returns trade rows for citation.
- `get_debrief_inputs({ date })` — the day's trades + metrics bundle for debrief generation.

All tools are thin wrappers over packages/analytics. No raw SQL access for the LLM.

## Guardrails
- System prompt forbids: computing numbers, advice/signals/predictions, discussing
  other users, answering outside the user's own trading data + general trading concepts.
- Every numeric claim in output must appear in a tool result. Post-generation validator
  scans response numbers against tool results; mismatch → regenerate once, then fail
  gracefully ("couldn't verify that — try rephrasing") and log for RS.
- Prompt-injection: trade notes/symbols are data, never instructions — wrap tool results
  in delimiters and instruct model accordingly.

## Eval gate (phase 4 exit)
- `evals/copilot-queries.json`: ≥40 natural-language questions with expected engine
  outputs (RS to seed from real usage). Ship only at 100% numeric agreement with dashboard.

## Daily debrief (phase 5)
- Input: get_debrief_inputs(today). Output: ≤180 words, structure: what happened (net,
  after charges) → plan adherence → ONE thing for tomorrow. Direct, not preachy. No hype,
  no shame. Numbers verbatim from engine.
