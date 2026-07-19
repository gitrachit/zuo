import type { ChargeRateConfig, ChargeRateEntry } from "./config-schema";
import zerodhaJson from "../config/zerodha.json";

/** Throws if eras overlap or an entry's date range is inverted. */
export function validateConfig(config: ChargeRateConfig): ChargeRateConfig {
  const sorted = [...config.entries].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (!entry) continue;
    if (entry.effectiveTo !== null && entry.effectiveTo < entry.effectiveFrom) {
      throw new Error(
        `${config.broker}: inverted era ${entry.effectiveFrom}..${entry.effectiveTo}`,
      );
    }
    const next = sorted[i + 1];
    if (next && (entry.effectiveTo === null || entry.effectiveTo >= next.effectiveFrom)) {
      throw new Error(
        `${config.broker}: overlapping eras at ${next.effectiveFrom}`,
      );
    }
  }
  return config;
}

/**
 * The entry in force on tradeDate (YYYY-MM-DD, IST trading date), or null if
 * no era covers it. Callers must treat null as "cannot compute charges" —
 * never fall back to a neighbouring era.
 */
export function selectRateEntry(
  config: ChargeRateConfig,
  tradeDate: string,
): ChargeRateEntry | null {
  for (const entry of config.entries) {
    if (
      tradeDate >= entry.effectiveFrom &&
      (entry.effectiveTo === null || tradeDate <= entry.effectiveTo)
    ) {
      return entry;
    }
  }
  return null;
}

let cachedZerodha: ChargeRateConfig | null = null;

/** Bundled Zerodha rate tables (config/zerodha.json), validated once. */
export function zerodhaConfig(): ChargeRateConfig {
  cachedZerodha ??= validateConfig(zerodhaJson as ChargeRateConfig);
  return cachedZerodha;
}
