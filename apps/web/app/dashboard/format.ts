// Display formatters. Numbers arrive as integer paise from the engine and are
// only ever formatted here — never recomputed.

export function formatINR(paise: number | null): string {
  if (paise === null) return "—";
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

/** Signed, for P&L: "+₹1,234.00" / "-₹567.00". */
export function formatSignedINR(paise: number | null): string {
  if (paise === null) return "—";
  const sign = paise > 0 ? "+" : "";
  return sign + formatINR(paise);
}

export function pnlClass(paise: number | null): string {
  if (paise === null || paise === 0) return "text-[var(--muted)]";
  return paise > 0 ? "text-[var(--gain)]" : "text-[var(--loss)]";
}

export function formatPct(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatRatio(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatIstDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
