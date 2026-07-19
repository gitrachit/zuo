import {
  mapTradebookRows,
  matchExecutions,
  parseTradebookCsv,
  parseTradebookXlsx,
  type ImportWarning,
} from "@zuo/importer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  chargeTradesForAccount,
  type ChargeableExecution,
} from "@/lib/import/charge-trades";
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
  /** trades whose dates fall outside every charge-rate era (charges null) */
  chargesUnavailable: number;
  /** IST dates with no charge-rate era coverage */
  uncoveredDates: string[];
  /** equity symbol-days where intraday/delivery was inferred as MIXED */
  mixedEquityDays: number;
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
      "id, symbol, exchange, segment, product, side, quantity, price_paise, executed_at, underlying, expiry, strike_paise, option_type, broker_order_id",
    )
    .eq("broker_account_id", accountId);
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

  const executionRows = allRows as (ExecutionRow & { id: string })[];
  const trades = matchExecutions(executionRows.map(matchableFromRow));

  // charges: estimate per trade from note-level engine output (phase 2)
  const chargeable: ChargeableExecution[] = executionRows.map((row) => ({
    id: row.id,
    brokerOrderId: row.broker_order_id,
    side: row.side as ChargeableExecution["side"],
    quantity: row.quantity,
    pricePaise: row.price_paise,
    executedAt: new Date(row.executed_at).toISOString(),
    exchange: row.exchange,
    symbol: row.symbol,
    segment: row.segment as ChargeableExecution["segment"],
    optionType: row.option_type as ChargeableExecution["optionType"],
  }));
  const chargeResult = chargeTradesForAccount(
    chargeable,
    trades.map((t, i) => ({
      key: String(i),
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      grossPnlPaise: t.grossPnlPaise,
      executionIds: t.executionIds,
    })),
  );
  const chargedTrades = trades.map((t, i) => {
    const charge = chargeResult.perTrade.get(String(i));
    if (!charge) return t;
    return {
      ...t,
      chargesPaise: charge.chargesPaise,
      charges: charge.charges,
      netPnlPaise: charge.netPnlPaise,
    };
  });

  const { error: deleteError } = await supabase
    .from("trades")
    .delete()
    .eq("broker_account_id", accountId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  for (const chunk of chunked(chargedTrades.map((t) => tradeRowFromDraft(t, user.id, accountId)))) {
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
    chargesUnavailable: [...chargeResult.perTrade.values()].filter((v) => v === null).length,
    uncoveredDates: chargeResult.uncoveredDates,
    mixedEquityDays: chargeResult.mixedEquityDays,
  };
  return Response.json(summary);
}
