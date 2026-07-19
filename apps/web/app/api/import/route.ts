import {
  mapTradebookRows,
  matchExecutions,
  parseTradebookCsv,
  parseTradebookXlsx,
  type ImportWarning,
} from "@zuo/importer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  executionRowFromDraft,
  matchableFromRow,
  tradeRowFromDraft,
  type ExecutionRow,
} from "@/lib/import/serialize";

export interface ImportSummary {
  rowsRead: number;
  rowsSkipped: number;
  newExecutions: number;
  duplicates: number;
  tradesFormed: number;
  openPositions: number;
  warnings: ImportWarning[];
  /** Console tradebooks carry no MIS/CNC column — surfaced in the UI (spec v1). */
  productUnknown: true;
}

const CHUNK = 500;

function chunked<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  const tabular = file.name.toLowerCase().endsWith(".xlsx")
    ? await parseTradebookXlsx(await file.arrayBuffer())
    : parseTradebookCsv(await file.text());
  const mapped = mapTradebookRows(tabular.headers, tabular.rows);

  if (mapped.warnings.some((w) => w.code === "missing_required_columns")) {
    return Response.json(
      { error: "File is missing required columns", warnings: mapped.warnings },
      { status: 422 },
    );
  }

  // default broker account (Console imports are Zerodha)
  const { data: existingAccount, error: accountError } = await supabase
    .from("broker_accounts")
    .select("id")
    .eq("broker", "zerodha")
    .limit(1)
    .maybeSingle();
  if (accountError) {
    return Response.json({ error: accountError.message }, { status: 500 });
  }
  let accountId = existingAccount?.id as string | undefined;
  if (!accountId) {
    const { data: created, error: createError } = await supabase
      .from("broker_accounts")
      .insert({ user_id: user.id, broker: "zerodha", label: "Zerodha (Console import)" })
      .select("id")
      .single();
    if (createError) return Response.json({ error: createError.message }, { status: 500 });
    accountId = created.id as string;
  }

  // insert executions; the unique index makes re-imports a no-op
  let newExecutions = 0;
  for (const chunk of chunked(mapped.drafts.map((d) => executionRowFromDraft(d, user.id, accountId)))) {
    const { data, error } = await supabase
      .from("executions")
      .upsert(chunk, {
        onConflict: "broker_account_id,broker_trade_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    newExecutions += data?.length ?? 0;
  }

  // rebuild trades for the whole account (executions are the source of truth)
  const { data: allRows, error: fetchError } = await supabase
    .from("executions")
    .select(
      "id, symbol, segment, product, side, quantity, price_paise, executed_at, underlying, expiry, strike_paise, option_type",
    )
    .eq("broker_account_id", accountId);
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const trades = matchExecutions(
    (allRows as (ExecutionRow & { id: string })[]).map(matchableFromRow),
  );

  const { error: deleteError } = await supabase
    .from("trades")
    .delete()
    .eq("broker_account_id", accountId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  for (const chunk of chunked(trades.map((t) => tradeRowFromDraft(t, user.id, accountId)))) {
    const { error } = await supabase.from("trades").insert(chunk);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const summary: ImportSummary = {
    rowsRead: mapped.rowsRead,
    rowsSkipped: mapped.rowsSkipped,
    newExecutions,
    duplicates: mapped.drafts.length - newExecutions,
    tradesFormed: trades.length,
    openPositions: trades.filter((t) => t.closedAt === null).length,
    warnings: mapped.warnings,
    productUnknown: true,
  };
  return Response.json(summary);
}
