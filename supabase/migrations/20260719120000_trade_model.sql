-- Trade model per docs/trade-model.md.
-- Money: bigint paise, always. Executions are immutable raw imports; trades are
-- derived and re-derivable. RLS on user_id everywhere a user owns rows.

-- ---------------------------------------------------------------- broker_accounts
create table public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('zerodha', 'dhan', 'other')),
  label text not null default '',
  created_at timestamptz not null default now()
);

alter table public.broker_accounts enable row level security;

create policy "own broker_accounts" on public.broker_accounts
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- executions
create table public.executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null references public.broker_accounts (id) on delete cascade,
  source text not null check (source in ('zerodha_csv', 'zerodha_kite', 'dhan_api', 'manual', 'generic_csv')),
  broker_trade_id text not null,
  broker_order_id text not null,
  symbol text not null,
  exchange text not null check (exchange in ('NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS', 'GLOBAL')),
  segment text not null check (segment in ('EQ', 'FUT', 'OPT', 'COMMODITY_FUT', 'COMMODITY_OPT', 'CURRENCY')),
  product text not null check (product in ('MIS', 'CNC', 'NRML', 'OTHER')),
  side text not null check (side in ('BUY', 'SELL')),
  quantity bigint not null check (quantity > 0),
  price_paise bigint not null check (price_paise >= 0),
  executed_at timestamptz not null,
  -- derivatives (null for EQ):
  underlying text,
  expiry date,
  strike_paise bigint,
  option_type text check (option_type in ('CE', 'PE')),
  lot_size integer,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- dedupe key: re-importing the same file must be a no-op
create unique index executions_dedupe
  on public.executions (broker_account_id, broker_trade_id);

create index executions_matching_scope
  on public.executions (user_id, broker_account_id, executed_at);

alter table public.executions enable row level security;

create policy "own executions" on public.executions
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- trades
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null references public.broker_accounts (id) on delete cascade,
  instrument_key text not null,
  segment text not null check (segment in ('EQ', 'FUT', 'OPT', 'COMMODITY_FUT', 'COMMODITY_OPT', 'CURRENCY')),
  product text not null check (product in ('MIS', 'CNC', 'NRML', 'OTHER')),
  direction text not null check (direction in ('LONG', 'SHORT')),
  opened_at timestamptz not null,
  closed_at timestamptz, -- null = open position
  quantity bigint not null check (quantity > 0),
  avg_entry_paise bigint not null,
  avg_exit_paise bigint,
  gross_pnl_paise bigint,
  charges_paise bigint,
  charges jsonb, -- ChargeBreakdown: {stt, brokerage, exchangeTxn, gst, sebi, stampDuty, dp}
  net_pnl_paise bigint,
  execution_ids uuid[] not null default '{}',
  -- enrichment (AI + rules):
  setup_tag text,
  session_bucket text check (session_bucket in ('pre_open', 'open_15', 'morning', 'midday', 'afternoon', 'close_30')),
  is_expiry_day boolean not null default false,
  hold_seconds bigint,
  r_multiple numeric, -- ratio, not money; null if user risk unknown — never guessed
  notes text,
  strategy_group_id uuid, -- multi-leg grouping, unused in v1
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trades_user_opened on public.trades (user_id, opened_at desc);
create index trades_instrument on public.trades (user_id, instrument_key);

alter table public.trades enable row level security;

create policy "own trades" on public.trades
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- charge_rate_configs
-- Global, dated rate tables (docs/charges-engine.md). Never mutate old rows —
-- add a new dated entry; historical trades must recompute identically forever.
create table public.charge_rate_configs (
  id uuid primary key default gen_random_uuid(),
  broker text not null,
  effective_from date not null,
  effective_to date, -- null = current
  config jsonb not null, -- rate table keyed by (exchange, segment, product)
  created_at timestamptz not null default now()
);

create index charge_rate_configs_lookup
  on public.charge_rate_configs (broker, effective_from desc);

alter table public.charge_rate_configs enable row level security;

-- read-only for signed-in users; writes go through the service role only
create policy "read charge configs" on public.charge_rate_configs
  for select using ((select auth.role()) = 'authenticated');

-- ---------------------------------------------------------------- tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tags enable row level security;

create policy "own tags" on public.tags
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- debriefs
create table public.debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  debrief_date date not null,
  content text not null,
  inputs jsonb not null default '{}'::jsonb, -- engine numbers the narrative cites
  created_at timestamptz not null default now(),
  unique (user_id, debrief_date)
);

alter table public.debriefs enable row level security;

create policy "own debriefs" on public.debriefs
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
