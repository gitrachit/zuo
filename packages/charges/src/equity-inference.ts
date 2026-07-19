// Equity product inference (docs/phase-2-plan.md, policy from RS's pack):
// per (symbol, IST trade date), matched same-day buy/sell quantity is charged
// as INTRADAY; residual quantity as DELIVERY. A day can be MIXED. FIFO: matched
// quantity is allocated to the earliest orders on each side. Never applied to
// derivatives. Everything downstream must surface this as an inference.

export interface EquityDayOrder {
  brokerOrderId: string;
  side: "BUY" | "SELL";
  /** earliest fill time in the order — FIFO allocation key */
  firstExecutedAt: string;
  quantity: number;
  turnoverPaise: number;
}

export type EquityStyle = "intraday" | "delivery";

export interface StyledPortion {
  brokerOrderId: string;
  side: "BUY" | "SELL";
  style: EquityStyle;
  quantity: number;
  turnoverPaise: number;
}

export interface EquityDaySplit {
  portions: StyledPortion[];
  matchedQty: number;
  buyResidualQty: number;
  sellResidualQty: number;
  mixed: boolean;
}

function allocateSide(orders: EquityDayOrder[], matched: number): StyledPortion[] {
  const sorted = [...orders].sort((a, b) => a.firstExecutedAt.localeCompare(b.firstExecutedAt));
  const portions: StyledPortion[] = [];
  let remaining = matched;
  for (const order of sorted) {
    const intradayQty = Math.min(remaining, order.quantity);
    remaining -= intradayQty;
    const deliveryQty = order.quantity - intradayQty;
    // portion turnover splits pro-rata by qty at the order's average price;
    // residue stays with the delivery portion so the order total is exact
    const intradayTurnover = Math.round((order.turnoverPaise * intradayQty) / order.quantity);
    if (intradayQty > 0) {
      portions.push({
        brokerOrderId: order.brokerOrderId,
        side: order.side,
        style: "intraday",
        quantity: intradayQty,
        turnoverPaise: intradayTurnover,
      });
    }
    if (deliveryQty > 0) {
      portions.push({
        brokerOrderId: order.brokerOrderId,
        side: order.side,
        style: "delivery",
        quantity: deliveryQty,
        turnoverPaise: order.turnoverPaise - (intradayQty > 0 ? intradayTurnover : 0),
      });
    }
  }
  return portions;
}

/** Split one equity symbol-day's orders into intraday/delivery portions. */
export function splitEquityDay(orders: EquityDayOrder[]): EquityDaySplit {
  const buys = orders.filter((o) => o.side === "BUY");
  const sells = orders.filter((o) => o.side === "SELL");
  const buyQty = buys.reduce((s, o) => s + o.quantity, 0);
  const sellQty = sells.reduce((s, o) => s + o.quantity, 0);
  const matchedQty = Math.min(buyQty, sellQty);

  const portions = [...allocateSide(buys, matchedQty), ...allocateSide(sells, matchedQty)];
  return {
    portions,
    matchedQty,
    buyResidualQty: buyQty - matchedQty,
    sellResidualQty: sellQty - matchedQty,
    mixed: matchedQty > 0 && buyQty !== sellQty,
  };
}
