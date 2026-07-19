// Zerodha tradingsymbol parser for derivatives (NFO/BFO/MCX/CDS).
//
// Grammars (docs/phase-1-spec.md):
//   futures:          UNDERLYING + YY + MMM + "FUT"          NIFTY25JULFUT, GOLDM25AUGFUT
//   monthly options:  UNDERLYING + YY + MMM + STRIKE + CE|PE NIFTY25JUL25000CE, USDINR25JUL83.5CE
//   weekly options:   UNDERLYING + YY + M + DD + STRIKE + CE|PE
//                     where M is 1-9 (Jan-Sep), O, N, D      NIFTY2570325000CE = 2025-07-03
//
// Monthly symbols carry no expiry day — expiryDay is null and must be resolved
// from the tradebook's expiry column or an exchange calendar, never guessed here.

import type { OptionType } from "@zuo/types";

export interface ParsedDerivativeSymbol {
  underlying: string;
  kind: "FUT" | "OPT";
  expiryYear: number; // full year, e.g. 2025
  expiryMonth: number; // 1-12
  expiryDay: number | null; // exact for weekly option symbols; null for monthly
  strikePaise?: number;
  optionType?: OptionType;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const WEEKLY_MONTH: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  O: 10, N: 11, D: 12,
};

// Two-digit years far outside trading reality are treated as failed parses so
// ambiguous weekly splits get pruned (e.g. a split that implies year 2070).
const MIN_YEAR = 2015;
const MAX_YEAR = 2049;

function yearFrom(yy: string): number | null {
  const year = 2000 + Number(yy);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/** "25000" → 2500000; "83.5" → 8350. Integer string math — no float money. */
export function strikeToPaise(strike: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(strike);
  if (!match || match[1] === undefined) return null;
  const rupees = Number(match[1]);
  const fraction = Number(((match[2] ?? "") + "00").slice(0, 2));
  return rupees * 100 + fraction;
}

function parseFuture(body: string): ParsedDerivativeSymbol | null {
  // UNDERLYING + YY + MMM (FUT already stripped)
  if (body.length < 6) return null;
  const month = MONTHS[body.slice(-3)];
  const yy = body.slice(-5, -3);
  const underlying = body.slice(0, -5);
  if (month === undefined || !/^\d{2}$/.test(yy) || underlying === "") return null;
  const year = yearFrom(yy);
  if (year === null) return null;
  return { underlying, kind: "FUT", expiryYear: year, expiryMonth: month, expiryDay: null };
}

function parseMonthlyOption(body: string, optionType: OptionType): ParsedDerivativeSymbol | null {
  // UNDERLYING + YY + MMM + STRIKE (CE/PE already stripped).
  // The month is letters, so the strike is exactly the trailing digit/dot run.
  const match = /^(.+)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)([\d.]+)$/.exec(body);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) return null;
  const year = yearFrom(match[2]);
  const strikePaise = strikeToPaise(match[4]);
  if (year === null || strikePaise === null) return null;
  const month = MONTHS[match[3]];
  if (month === undefined) return null;
  return {
    underlying: match[1],
    kind: "OPT",
    expiryYear: year,
    expiryMonth: month,
    expiryDay: null,
    strikePaise,
    optionType,
  };
}

function parseWeeklyOption(body: string, optionType: OptionType): ParsedDerivativeSymbol | null {
  // UNDERLYING + YY + M + DD + STRIKE (CE/PE already stripped). The month can
  // be a digit, so the split is ambiguous by regex alone — iterate candidate
  // strike lengths from longest (leftmost date token) and validate each split.
  const tail = /[\d.]+$/.exec(body)?.[0];
  if (tail === undefined) return null;
  for (let strikeLen = tail.length; strikeLen >= 1; strikeLen--) {
    const strike = body.slice(body.length - strikeLen);
    const rest = body.slice(0, body.length - strikeLen);
    // rest must end with YY + M + DD (5 chars) and leave a non-empty underlying
    if (rest.length < 6) continue;
    const day = Number(rest.slice(-2));
    const monthChar = rest.slice(-3, -2);
    const yy = rest.slice(-5, -3);
    const underlying = rest.slice(0, -5);
    if (!/^\d{2}$/.test(rest.slice(-2)) || !/^\d{2}$/.test(yy)) continue;
    const month = WEEKLY_MONTH[monthChar];
    if (month === undefined || underlying === "") continue;
    if (day < 1 || day > 31) continue;
    const year = yearFrom(yy);
    const strikePaise = strikeToPaise(strike);
    if (year === null || strikePaise === null) continue;
    return {
      underlying,
      kind: "OPT",
      expiryYear: year,
      expiryMonth: month,
      expiryDay: day,
      strikePaise,
      optionType,
    };
  }
  return null;
}

/**
 * Parse a derivative tradingsymbol. Returns null for anything that doesn't
 * match a derivative grammar (equities, malformed symbols) — the caller decides
 * whether null is fine (EQ segment) or a warning (derivative segment).
 */
export function parseTradingSymbol(symbol: string): ParsedDerivativeSymbol | null {
  const s = symbol.trim().toUpperCase();
  if (s.endsWith("FUT")) return parseFuture(s.slice(0, -3));
  const optionType = s.endsWith("CE") ? "CE" : s.endsWith("PE") ? "PE" : null;
  if (optionType === null) return null;
  const body = s.slice(0, -2);
  return parseMonthlyOption(body, optionType) ?? parseWeeklyOption(body, optionType);
}
