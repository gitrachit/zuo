// Copilot tool layer (docs/copilot-architecture.md). Thin wrappers over
// packages/analytics — the LLM selects tools, THESE compute the numbers, the
// LLM narrates verbatim. Pure and deterministic: every function takes the
// user's trades + parsed args and returns exact figures. No LLM here, no SQL.

import {
  computeMetrics,
  filterTrades,
  groupBy,
  type AnalyticsTrade,
  type GroupDimension,
  type Metrics,
  type TradeFilter,
} from "@zuo/analytics";

// ---- metric names exposed to the LLM ↔ Metrics fields ----------------------

export const METRIC_NAMES = [
  "win_rate",
  "expectancy_r",
  "profit_factor",
  "net_pnl",
  "gross_pnl",
  "charges_total",
  "avg_win",
  "avg_loss",
  "max_drawdown",
  "trade_count",
  "hold_time_avg",
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

const METRIC_FIELD: Record<MetricName, keyof Metrics> = {
  win_rate: "winRate",
  expectancy_r: "expectancyR",
  profit_factor: "profitFactor",
  net_pnl: "netPnlPaise",
  gross_pnl: "grossPnlPaise",
  charges_total: "chargesPaise",
  avg_win: "avgWinPaise",
  avg_loss: "avgLossPaise",
  max_drawdown: "maxDrawdownPaise",
  trade_count: "tradeCount",
  hold_time_avg: "avgHoldSeconds",
};

function pickMetrics(metrics: Metrics, names: MetricName[]): Record<MetricName, number | null> {
  const out = {} as Record<MetricName, number | null>;
  for (const name of names) out[name] = metrics[METRIC_FIELD[name]] as number | null;
  return out;
}

// ---- query_metrics ---------------------------------------------------------

export interface QueryMetricsArgs {
  metric: MetricName[];
  groupBy?: GroupDimension;
  filters?: TradeFilter;
  dateRange?: { fromDate?: string; toDate?: string };
}

export interface QueryMetricsResult {
  /** metrics over the filtered set (always present) */
  overall: Record<MetricName, number | null>;
  /** per-bucket metrics when groupBy is set */
  groups?: { key: string; metrics: Record<MetricName, number | null> }[];
  tradeCount: number;
  /** all money values are integer paise; ratios are 0..1 or null */
  unit: "paise";
}

export function executeQueryMetrics(
  trades: AnalyticsTrade[],
  args: QueryMetricsArgs,
): QueryMetricsResult {
  const filter: TradeFilter = { ...args.filters, ...args.dateRange };
  const filtered = filterTrades(trades, filter);
  const result: QueryMetricsResult = {
    overall: pickMetrics(computeMetrics(filtered), args.metric),
    tradeCount: filtered.length,
    unit: "paise",
  };
  if (args.groupBy) {
    result.groups = groupBy(filtered, args.groupBy).map((b) => ({
      key: b.key,
      metrics: pickMetrics(b.metrics, args.metric),
    }));
  }
  return result;
}

// ---- list_trades -----------------------------------------------------------

export interface ListTradesArgs {
  filters?: TradeFilter;
  sort?: "net_pnl_desc" | "net_pnl_asc" | "closed_at_desc" | "closed_at_asc";
  limit?: number;
}

export interface TradeCitation {
  instrumentKey: string;
  direction: "LONG" | "SHORT";
  segment: string;
  netPnlPaise: number;
  grossPnlPaise: number;
  chargesPaise: number;
  closedAt: string;
  setupTag: string | null;
}

const SORTERS: Record<NonNullable<ListTradesArgs["sort"]>, (a: AnalyticsTrade, b: AnalyticsTrade) => number> = {
  net_pnl_desc: (a, b) => b.netPnlPaise - a.netPnlPaise,
  net_pnl_asc: (a, b) => a.netPnlPaise - b.netPnlPaise,
  closed_at_desc: (a, b) => b.closedAt.localeCompare(a.closedAt),
  closed_at_asc: (a, b) => a.closedAt.localeCompare(b.closedAt),
};

export function executeListTrades(trades: AnalyticsTrade[], args: ListTradesArgs): TradeCitation[] {
  const filtered = filterTrades(trades, args.filters ?? {});
  const sorted = [...filtered].sort(SORTERS[args.sort ?? "closed_at_desc"]);
  const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
  return sorted.slice(0, limit).map((t) => ({
    instrumentKey: t.instrumentKey,
    direction: t.direction,
    segment: t.segment,
    netPnlPaise: t.netPnlPaise,
    grossPnlPaise: t.grossPnlPaise,
    chargesPaise: t.chargesPaise,
    closedAt: t.closedAt,
    setupTag: t.setupTag,
  }));
}

// ---- get_debrief_inputs ----------------------------------------------------

export interface GetDebriefInputsArgs {
  /** IST date YYYY-MM-DD */
  date: string;
}

export interface DebriefInputs {
  date: string;
  metrics: Record<MetricName, number | null>;
  trades: TradeCitation[];
  unit: "paise";
}

export function executeGetDebriefInputs(
  trades: AnalyticsTrade[],
  args: GetDebriefInputsArgs,
): DebriefInputs {
  const dayTrades = filterTrades(trades, { fromDate: args.date, toDate: args.date });
  return {
    date: args.date,
    metrics: pickMetrics(computeMetrics(dayTrades), [...METRIC_NAMES]),
    trades: executeListTrades(dayTrades, { sort: "closed_at_asc", limit: 100 }),
    unit: "paise",
  };
}

// ---- dispatcher + JSON-schema definitions ----------------------------------

export type ToolName = "query_metrics" | "list_trades" | "get_debrief_inputs";

/**
 * Dispatch a validated tool call to its deterministic executor. `args` is the
 * LLM-provided input; callers validate/parse it against the schemas below.
 */
export function runTool(name: ToolName, args: unknown, trades: AnalyticsTrade[]): unknown {
  switch (name) {
    case "query_metrics":
      return executeQueryMetrics(trades, args as QueryMetricsArgs);
    case "list_trades":
      return executeListTrades(trades, args as ListTradesArgs);
    case "get_debrief_inputs":
      return executeGetDebriefInputs(trades, args as GetDebriefInputsArgs);
  }
}

const FILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fromDate: { type: "string", description: "inclusive IST date YYYY-MM-DD" },
    toDate: { type: "string", description: "inclusive IST date YYYY-MM-DD" },
    instrumentKey: { type: "string" },
    segment: { type: "string", enum: ["EQ", "FUT", "OPT", "COMMODITY_FUT", "COMMODITY_OPT", "CURRENCY"] },
    product: { type: "string", enum: ["MIS", "CNC", "NRML", "OTHER"] },
    setupTag: { type: "string" },
    direction: { type: "string", enum: ["LONG", "SHORT"] },
    expiryDay: { type: "boolean" },
    sessionBucket: { type: "string", enum: ["pre_open", "open_15", "morning", "midday", "afternoon", "close_30"] },
  },
} as const;

/** Anthropic tool definitions (thin over packages/analytics). */
export const TOOL_DEFINITIONS = [
  {
    name: "query_metrics",
    description:
      "Compute deterministic trading metrics over the user's own closed trades. Returns exact figures (money in integer paise, ratios 0..1 or null). Use for any numeric question. Never compute numbers yourself.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["metric"],
      properties: {
        metric: {
          type: "array",
          items: { type: "string", enum: [...METRIC_NAMES] },
          description: "which metrics to compute",
        },
        groupBy: {
          type: "string",
          enum: ["setup", "instrument", "session_bucket", "day_of_week", "expiry_day", "product", "direction"],
        },
        filters: FILTER_SCHEMA,
        dateRange: {
          type: "object",
          additionalProperties: false,
          properties: {
            fromDate: { type: "string" },
            toDate: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "list_trades",
    description:
      "List the user's own closed trades (for citing specific trades). Returns exact per-trade figures in paise. Does not compute aggregates.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        filters: FILTER_SCHEMA,
        sort: { type: "string", enum: ["net_pnl_desc", "net_pnl_asc", "closed_at_desc", "closed_at_asc"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "get_debrief_inputs",
    description:
      "Get one IST day's trades and metrics bundle, for generating the daily debrief. Numbers are exact (paise).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["date"],
      properties: {
        date: { type: "string", description: "IST date YYYY-MM-DD" },
      },
    },
  },
] as const;
