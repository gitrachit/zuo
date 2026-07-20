// Dashboard data layer (phase 3 PR C). Pure: DB trade rows → typed bundle.
// No metric math here — every number comes from packages/analytics. This
// module only decides which trades qualify and reshapes rows.
//
// A trade feeds analytics iff it is CLOSED and charges-known (net P&L present).
// Open positions and uncovered-charge-era trades are excluded and counted, so
// the headline is never silently wrong.

import {
  calendarByDay,
  computeMetrics,
  equityCurve,
  groupBy,
  type AnalyticsTrade,
  type CalendarDay,
  type EquityPoint,
  type Metrics,
  type MetricsBucket,
  type GroupDimension,
} from "@zuo/analytics";
import type { Product, Segment, SessionBucket } from "@zuo/types";

export interface DashboardTradeRow {
  instrument_key: string;
  segment: Segment;
  product: Product;
  direction: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string | null;
  quantity: number;
  gross_pnl_paise: number | null;
  charges_paise: number | null;
  net_pnl_paise: number | null;
  setup_tag: string | null;
  session_bucket: SessionBucket | null;
  is_expiry_day: boolean;
  hold_seconds: number | null;
  r_multiple: number | null;
}

export interface RecentTrade {
  instrumentKey: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  openedAt: string;
  closedAt: string | null;
  netPnlPaise: number | null;
  chargesPaise: number | null;
  grossPnlPaise: number | null;
}

export interface DashboardBundle {
  metrics: Metrics;
  equityCurve: EquityPoint[];
  calendar: CalendarDay[];
  slices: Record<GroupDimension, MetricsBucket[]>;
  recentTrades: RecentTrade[];
  excluded: {
    /** still-open positions (no net P&L yet) */
    openPositions: number;
    /** closed, but no charge-rate era covers the trade date */
    chargesUnknown: number;
  };
  /** total trades considered (included + excluded) */
  totalTrades: number;
  includedTrades: number;
}

const SLICE_DIMENSIONS: GroupDimension[] = [
  "setup",
  "instrument",
  "session_bucket",
  "day_of_week",
  "expiry_day",
  "product",
  "direction",
];

function isCharged(
  row: DashboardTradeRow,
): row is DashboardTradeRow & { net_pnl_paise: number; gross_pnl_paise: number; charges_paise: number; closed_at: string } {
  return (
    row.closed_at !== null &&
    row.net_pnl_paise !== null &&
    row.gross_pnl_paise !== null &&
    row.charges_paise !== null
  );
}

function toAnalyticsTrade(
  row: DashboardTradeRow & { net_pnl_paise: number; gross_pnl_paise: number; charges_paise: number; closed_at: string },
): AnalyticsTrade {
  return {
    netPnlPaise: row.net_pnl_paise,
    grossPnlPaise: row.gross_pnl_paise,
    chargesPaise: row.charges_paise,
    closedAt: row.closed_at,
    holdSeconds: row.hold_seconds,
    rMultiple: row.r_multiple,
    setupTag: row.setup_tag,
    instrumentKey: row.instrument_key,
    segment: row.segment,
    product: row.product,
    direction: row.direction,
    sessionBucket: row.session_bucket,
    isExpiryDay: row.is_expiry_day,
  };
}

/** Build the dashboard bundle from all of a user's trade rows. */
export function buildDashboardBundle(
  rows: DashboardTradeRow[],
  recentLimit = 50,
): DashboardBundle {
  const included = rows.filter(isCharged);
  const analyticsTrades = included.map(toAnalyticsTrade);

  const openPositions = rows.filter((r) => r.closed_at === null).length;
  const chargesUnknown = rows.filter(
    (r) => r.closed_at !== null && r.net_pnl_paise === null,
  ).length;

  const slices = Object.fromEntries(
    SLICE_DIMENSIONS.map((dim) => [dim, groupBy(analyticsTrades, dim)]),
  ) as Record<GroupDimension, MetricsBucket[]>;

  const recentTrades: RecentTrade[] = [...rows]
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
    .slice(0, recentLimit)
    .map((r) => ({
      instrumentKey: r.instrument_key,
      direction: r.direction,
      quantity: r.quantity,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      netPnlPaise: r.net_pnl_paise,
      chargesPaise: r.charges_paise,
      grossPnlPaise: r.gross_pnl_paise,
    }));

  return {
    metrics: computeMetrics(analyticsTrades),
    equityCurve: equityCurve(analyticsTrades),
    calendar: calendarByDay(analyticsTrades),
    slices,
    recentTrades,
    excluded: { openPositions, chargesUnknown },
    totalTrades: rows.length,
    includedTrades: included.length,
  };
}
