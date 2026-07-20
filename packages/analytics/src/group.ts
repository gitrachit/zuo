// Filtering and dimensional slicing over analytics trades. Pure; every bucket's
// numbers come from computeMetrics so slices are consistent with the headline.

import { computeMetrics } from "./metrics";
import { istDate, istWeekday, WEEKDAYS } from "./ist";
import type { AnalyticsTrade, Metrics } from "./types";
import type { Product, Segment, SessionBucket } from "@zuo/types";

export type GroupDimension =
  | "setup"
  | "instrument"
  | "session_bucket"
  | "day_of_week"
  | "expiry_day"
  | "product"
  | "direction";

export interface MetricsBucket {
  key: string;
  metrics: Metrics;
}

export interface TradeFilter {
  /** inclusive IST date bounds (YYYY-MM-DD) on closedAt */
  fromDate?: string;
  toDate?: string;
  instrumentKey?: string;
  segment?: Segment;
  product?: Product;
  setupTag?: string;
  direction?: "LONG" | "SHORT";
  expiryDay?: boolean;
  sessionBucket?: SessionBucket;
}

export function filterTrades(trades: AnalyticsTrade[], filter: TradeFilter): AnalyticsTrade[] {
  return trades.filter((t) => {
    const date = istDate(t.closedAt);
    if (filter.fromDate && date < filter.fromDate) return false;
    if (filter.toDate && date > filter.toDate) return false;
    if (filter.instrumentKey && t.instrumentKey !== filter.instrumentKey) return false;
    if (filter.segment && t.segment !== filter.segment) return false;
    if (filter.product && t.product !== filter.product) return false;
    if (filter.setupTag && t.setupTag !== filter.setupTag) return false;
    if (filter.direction && t.direction !== filter.direction) return false;
    if (filter.expiryDay !== undefined && t.isExpiryDay !== filter.expiryDay) return false;
    if (filter.sessionBucket && t.sessionBucket !== filter.sessionBucket) return false;
    return true;
  });
}

function bucketKey(trade: AnalyticsTrade, dimension: GroupDimension): string {
  switch (dimension) {
    case "setup":
      return trade.setupTag ?? "untagged";
    case "instrument":
      return trade.instrumentKey;
    case "session_bucket":
      return trade.sessionBucket ?? "unknown";
    case "day_of_week":
      return istWeekday(trade.closedAt);
    case "expiry_day":
      return trade.isExpiryDay ? "expiry" : "non_expiry";
    case "product":
      return trade.product;
    case "direction":
      return trade.direction;
  }
}

/**
 * Group trades by a dimension and compute per-bucket metrics. Buckets are
 * ordered by net P&L descending, except day_of_week which keeps Sun..Sat order.
 */
export function groupBy(trades: AnalyticsTrade[], dimension: GroupDimension): MetricsBucket[] {
  const groups = new Map<string, AnalyticsTrade[]>();
  for (const trade of trades) {
    const key = bucketKey(trade, dimension);
    const group = groups.get(key);
    if (group) group.push(trade);
    else groups.set(key, [trade]);
  }

  const buckets: MetricsBucket[] = [...groups.entries()].map(([key, group]) => ({
    key,
    metrics: computeMetrics(group),
  }));

  if (dimension === "day_of_week") {
    return buckets.sort(
      (a, b) => WEEKDAYS.indexOf(a.key as never) - WEEKDAYS.indexOf(b.key as never),
    );
  }
  return buckets.sort((a, b) => b.metrics.netPnlPaise - a.metrics.netPnlPaise);
}
