import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDashboardBundle, type DashboardBundle, type DashboardTradeRow } from "./build-bundle";

const TRADE_COLUMNS =
  "instrument_key, segment, product, direction, opened_at, closed_at, quantity, gross_pnl_paise, charges_paise, net_pnl_paise, setup_tag, session_bucket, is_expiry_day, hold_seconds, r_multiple";

export type FetchDashboardResult =
  | { ok: true; bundle: DashboardBundle }
  | { ok: false; reason: "not_configured" | "not_signed_in" | "error"; message?: string };

/** Fetch the signed-in user's trades and build the dashboard bundle. */
export async function fetchDashboardBundle(): Promise<FetchDashboardResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_signed_in" };

  // page through all trades (RLS scopes to the user)
  const rows: DashboardTradeRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("trades")
      .select(TRADE_COLUMNS)
      .order("opened_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { ok: false, reason: "error", message: error.message };
    const batch = (data ?? []) as DashboardTradeRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return { ok: true, bundle: buildDashboardBundle(rows) };
}
