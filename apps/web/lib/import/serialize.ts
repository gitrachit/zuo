// camelCase drafts (packages/importer) ⇄ snake_case Postgres rows.
// Kept pure and unit-tested; the route handler only orchestrates.

import type { ExecutionDraft, MatchableExecution, TradeDraft } from "@zuo/importer";

export interface ExecutionRow {
  id?: string;
  user_id: string;
  broker_account_id: string;
  source: string;
  broker_trade_id: string;
  broker_order_id: string;
  symbol: string;
  exchange: string;
  segment: string;
  product: string;
  side: string;
  quantity: number;
  price_paise: number;
  executed_at: string;
  underlying: string | null;
  expiry: string | null;
  strike_paise: number | null;
  option_type: string | null;
  lot_size: number | null;
  raw: Record<string, unknown>;
}

export function executionRowFromDraft(
  draft: ExecutionDraft,
  userId: string,
  brokerAccountId: string,
): ExecutionRow {
  return {
    user_id: userId,
    broker_account_id: brokerAccountId,
    source: draft.source,
    broker_trade_id: draft.brokerTradeId,
    broker_order_id: draft.brokerOrderId,
    symbol: draft.symbol,
    exchange: draft.exchange,
    segment: draft.segment,
    product: draft.product,
    side: draft.side,
    quantity: draft.quantity,
    price_paise: draft.pricePaise,
    executed_at: draft.executedAt,
    underlying: draft.underlying ?? null,
    expiry: draft.expiry ?? null,
    strike_paise: draft.strikePaise ?? null,
    option_type: draft.optionType ?? null,
    lot_size: draft.lotSize ?? null,
    raw: draft.raw,
  };
}

export function matchableFromRow(row: ExecutionRow & { id: string }): MatchableExecution {
  return {
    id: row.id,
    symbol: row.symbol,
    segment: row.segment as MatchableExecution["segment"],
    product: row.product as MatchableExecution["product"],
    side: row.side as MatchableExecution["side"],
    quantity: row.quantity,
    pricePaise: row.price_paise,
    executedAt: new Date(row.executed_at).toISOString(),
    underlying: row.underlying ?? undefined,
    expiry: row.expiry ?? undefined,
    strikePaise: row.strike_paise ?? undefined,
    optionType: (row.option_type ?? undefined) as MatchableExecution["optionType"],
  };
}

export interface TradeRow {
  user_id: string;
  broker_account_id: string;
  instrument_key: string;
  segment: string;
  product: string;
  direction: string;
  opened_at: string;
  closed_at: string | null;
  quantity: number;
  avg_entry_paise: number;
  avg_exit_paise: number | null;
  gross_pnl_paise: number | null;
  charges_paise: number | null;
  charges: Record<string, number> | null;
  net_pnl_paise: number | null;
  execution_ids: string[];
  setup_tag: string | null;
  session_bucket: string | null;
  is_expiry_day: boolean;
  hold_seconds: number | null;
  r_multiple: number | null;
  notes: string | null;
  strategy_group_id: string | null;
}

export function tradeRowFromDraft(
  draft: TradeDraft,
  userId: string,
  brokerAccountId: string,
): TradeRow {
  return {
    user_id: userId,
    broker_account_id: brokerAccountId,
    instrument_key: draft.instrumentKey,
    segment: draft.segment,
    product: draft.product,
    direction: draft.direction,
    opened_at: draft.openedAt,
    closed_at: draft.closedAt,
    quantity: draft.quantity,
    avg_entry_paise: draft.avgEntryPaise,
    avg_exit_paise: draft.avgExitPaise,
    gross_pnl_paise: draft.grossPnlPaise,
    charges_paise: draft.chargesPaise,
    charges: draft.charges as Record<string, number> | null,
    net_pnl_paise: draft.netPnlPaise,
    execution_ids: draft.executionIds,
    setup_tag: draft.setupTag,
    session_bucket: draft.sessionBucket,
    is_expiry_day: draft.isExpiryDay,
    hold_seconds: draft.holdSeconds,
    r_multiple: draft.rMultiple,
    notes: draft.notes,
    strategy_group_id: draft.strategyGroupId,
  };
}
