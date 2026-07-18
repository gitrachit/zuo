# Zuo

AI trading journal + copilot for Indian traders (Zerodha/Dhan · NSE/BSE/MCX).
Import your tradebook, get charges-aware net P&L, deterministic analytics, and an
AI copilot that narrates your own numbers — never advice, never signals.

## Repo map (Turborepo)

| Path | What |
| --- | --- |
| `apps/web` | Next.js 15 (App Router) — public site + dashboard |
| `apps/mobile` | Expo shell (post-web-launch; scaffold only) |
| `packages/types` | Canonical trade model types (`docs/trade-model.md` is source of truth) |
| `packages/charges` | Indian charges engine — pure functions, config-driven rates |
| `packages/analytics` | Deterministic metrics engine — pure functions |
| `packages/api-client` | Typed client shared by web/mobile |

Docs live in `docs/`; build phases in `PLAN.md`; working agreements in `CLAUDE.md`.

## Develop

```sh
corepack enable
pnpm install
pnpm turbo test lint typecheck   # the gate — must pass before any commit
pnpm --filter web dev
```
