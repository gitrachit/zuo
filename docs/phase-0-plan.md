# Phase 0 Plan — Repo & Infra (wk 1-2)

Target exit criteria (PLAN.md): hello-world web deployed; shared type imported by
web + mobile shell; CI green.

## 0.0 Housekeeping (first commit)
- Move spec files into `docs/` to match the paths CLAUDE.md and PLAN.md already
  reference (`docs/trade-model.md`, `docs/charges-engine.md`,
  `docs/copilot-architecture.md`, `docs/design-notes.md`, `docs/phase-1-spec.md`).
  `git mv` only — no content edits.
- Add `.gitignore` (node, Next.js, Expo, turbo, .env*), `.nvmrc`/`engines`
  (Node 22 LTS), root `README.md` (one paragraph + repo map).

## 0.1 Turborepo scaffold
Workspace: pnpm + turbo.

```
apps/web              Next.js 15 (App Router) + Tailwind — public page + /health
apps/mobile           Expo scaffold ONLY (renders one screen; no nav, no features)
packages/types        canonical types — seed with a small shared type (see 0.2)
packages/charges      stub: package.json + empty src/index.ts + placeholder test
packages/analytics    stub: same shape
packages/api-client   stub: same shape
```

Deliberately **not** in phase 0:
- `apps/api` (Go/chi) — per CLAUDE.md it may start as Next.js route handlers;
  nothing in phase 0 needs it. Directory is created when phase 1 needs ingestion.
- Any trade-model implementation — that is phase 1 (`docs/phase-1-spec.md`).
- Charges/analytics logic — phases 2–3. Stubs exist only so the workspace,
  test runner, and CI pipeline exercise every package from day one.

Root config:
- `tsconfig.base.json` — `strict: true`, `noUncheckedIndexedAccess`, shared paths.
- `turbo.json` — `test`, `lint`, `typecheck`, `build` pipelines with caching.
- ESLint flat config (typescript-eslint) shared from root; Prettier defaults.
- Vitest per package; `apps/web` also gets one trivial render test so the
  `test` pipeline is non-empty everywhere.

## 0.2 Shared type (exit-criterion proof)
Seed `packages/types` with the small stable enums from `docs/trade-model.md`
(`Exchange`, `Segment`, `Product`, `Side`) plus `APP_NAME` const — no
`Execution`/`Trade` interfaces yet (phase 1 owns those, and starting them early
violates the phase gate).
- `apps/web` home page renders something typed with them (e.g. lists supported
  exchanges).
- `apps/mobile` App screen imports the same and renders it.
This satisfies "shared type imported by web + mobile shell" with real, durable
code rather than a throwaway `Foo` type.

## 0.3 CI — GitHub Actions
`.github/workflows/ci.yml`:
- Triggers: PRs + pushes to `main`.
- Steps: checkout → pnpm (corepack) → `pnpm install --frozen-lockfile` →
  `pnpm turbo test lint typecheck` (the CLAUDE.md gate, verbatim) → turbo cache
  via `actions/cache`.
- Node version from `.nvmrc` so local and CI match.

## 0.4 Supabase (auth + Postgres) — split Claude/RS
Claude Code can:
- Add `@supabase/supabase-js` + `@supabase/ssr` to `apps/web`, client factory
  reading `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `.env.example` documenting required vars; `/health` route that reports
  Supabase reachability (and degrades gracefully when env is absent, so CI
  doesn't need secrets).
- Scaffold `supabase/` CLI directory (config + empty migrations dir) so phase 1
  migrations have a home.

**RS must do (blocked on credentials — cannot be done by Claude):**
- Create the Supabase project (region: `ap-south-1` Mumbai — India-native product).
- Put URL + anon key into Vercel env vars and a local `.env.local`.
- No tables/migrations in phase 0 — schema starts in phase 1.

## 0.5 Vercel deploy — split Claude/RS
Claude Code can:
- Ensure `apps/web` builds standalone (`pnpm turbo build` green), add
  `vercel.json` if monorepo settings need pinning.

**RS must do:**
- Import repo in Vercel, set root to `apps/web` (framework auto-detects),
  add Supabase env vars, confirm production deploy URL.

## 0.6 Exit checklist (do not advance to phase 1 until all pass + RS confirms)
- [ ] `pnpm turbo test lint typecheck` green locally and in CI
- [ ] CI runs on a PR and on `main`
- [ ] Web hello-world deployed on Vercel (public URL loads)
- [ ] `packages/types` enums imported and rendered by both `apps/web` and `apps/mobile`
- [ ] Supabase project live; `/health` reports connected in production
- [ ] Spec docs live under `docs/` and links in CLAUDE.md/PLAN.md resolve

## Sequencing
- **Week 1:** 0.0 → 0.1 → 0.2 → 0.3 (all Claude, no external accounts needed;
  CI green on the scaffold PR).
- **Week 2:** 0.4 → 0.5 (needs RS for Supabase + Vercel), then exit checklist.

## RS action items (start now)
1. Create Supabase project (Mumbai region) + share env vars (week 2).
2. Import repo into Vercel (week 2).
3. From PLAN.md phase 6 note, flagged early because it's the long pole:
   email kiteconnect@zerodha.com and talk@rainmatter.com about multi-user
   Kite Connect approval. PLAN.md says start NOW.

## Risks / open questions
- Next.js 15 + Expo in one pnpm workspace can fight over React versions —
  pin one React version at the root and let Expo's metro config resolve
  workspace packages; verified in 0.2 by the mobile import actually rendering.
- Tailwind v4 vs v3: default to what `create-next-app` ships; no custom design
  system in phase 0 (design tokens from docs/design-notes.md arrive with the
  dashboard in phase 3).
