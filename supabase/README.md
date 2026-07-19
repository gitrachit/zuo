# Supabase

Hosted project: ap-south-1 (Mumbai). Schema lives in `migrations/` — the trade
model per `docs/trade-model.md`.

Applying migrations (until `supabase link` is set up): Supabase dashboard →
SQL Editor → paste the migration file → Run. Apply files in filename order,
each exactly once. Never edit an applied migration — add a new one.
