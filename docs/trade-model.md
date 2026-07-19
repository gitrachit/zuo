# Canonical Trade Model (source of truth)

Two layers: raw **executions** (as imported from broker) → matched **trades** (round trips).
Never destroy raw executions; trades are derived and re-derivable.

## Execution (raw fill)
```ts
type Exchange = 'NSE' | 'BSE' | 'MCX' | 'NFO' | 'BFO' | 'CDS' | 'GLOBAL';
type Segment = 'EQ' | 'FUT' | 'OPT' | 'COMMODITY_FUT' | 'COMMODITY_OPT' | 'CURRENCY';
type Product = 'MIS' | 'CNC' | 'NRML' | 'OTHER';   // MIS=intraday, CNC=delivery
type Side = 'BUY' | 'SELL';

interface Execution {
  id: string;                  // uuid
  userId: string;
  brokerAccountId: string;     // fk → broker_accounts
  source: 'zerodha_csv' | 'zerodha_kite' | 'dhan_api' | 'manual' | 'generic_csv';
  brokerTradeId: string;       // broker's trade_id — dedupe key with brokerAccountId
  brokerOrderId: string;
  symbol: string;              // broker tradingsymbol, e.g. NIFTY25JUL25000CE, GOLDM25AUGFUT
  exchange: Exchange;
  segment: Segment;
  product: Product;
  side: Side;
  quantity: number;            // units (shares/lots*lotSize as units)
  pricePaise: number;          // integer paise per unit
  executedAt: string;          // UTC ISO
  // derivatives (nullable for EQ):
  underlying?: string;         // NIFTY, GOLDM, RELIANCE
  expiry?: string;             // YYYY-MM-DD
  strikePaise?: number;
  optionType?: 'CE' | 'PE';
  lotSize?: number;
  raw: Record<string, unknown>; // original row, jsonb
}
```

## Trade (matched round trip)
```ts
interface Trade {
  id: string;
  userId: string;
  brokerAccountId: string;
  instrumentKey: string;       // normalized: underlying+expiry+strike+optType or symbol
  segment: Segment;
  product: Product;
  direction: 'LONG' | 'SHORT';
  openedAt: string; closedAt: string | null;   // null = open position
  quantity: number;
  avgEntryPaise: number; avgExitPaise: number | null;
  grossPnlPaise: number | null;
  chargesPaise: number | null;     // from packages/charges, itemized in charges jsonb
  charges: ChargeBreakdown | null; // {stt, brokerage, exchangeTxn, gst, sebi, stampDuty, dp}
  netPnlPaise: number | null;
  executionIds: string[];
  // enrichment (AI + rules):
  setupTag: string | null;         // from user playbook or Haiku auto-tag
  sessionBucket: 'pre_open'|'open_15'|'morning'|'midday'|'afternoon'|'close_30'|null;
  isExpiryDay: boolean;
  holdSeconds: number | null;
  rMultiple: number | null;        // requires user-set risk; null if unknown, never guessed
  notes: string | null;
}
```

## Matching rules
- FIFO per (userId, brokerAccountId, instrumentKey, product).
- MIS and CNC/NRML positions in the same symbol are separate trades.
- Partial fills aggregate into avg prices; scale-ins/outs stay one Trade until flat.
- Multi-leg option strategies: keep legs as separate Trades in v1; add a `strategyGroupId` (nullable) for later grouping. Do NOT build a strategy classifier in phase 1.

## Postgres notes
- Tables: broker_accounts, executions, trades, charge_rate_configs, tags, debriefs.
- Unique index: executions(broker_account_id, broker_trade_id).
- All money columns bigint paise. RLS on user_id (Supabase).
