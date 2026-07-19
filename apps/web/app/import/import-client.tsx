"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportSummary } from "@/app/api/import/route";

export function ImportClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setSummary(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const json = (await res.json()) as ImportSummary & { error?: string };
      if (!res.ok) setError(json.error ?? `Import failed (${res.status})`);
      else {
        setSummary(json);
        router.refresh(); // refresh the server-rendered trades table
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded border-2 border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        <span>{busy ? "Importing…" : "Drop a Console tradebook here, or click to choose"}</span>
        <span className="text-xs">CSV or XLSX · Zerodha Console → Reports → Tradebook</span>
        <input
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {summary && (
        <div className="rounded border border-zinc-200 p-4 font-mono text-sm dark:border-zinc-800">
          <p>
            {summary.rowsRead} rows read · {summary.newExecutions} new executions ·{" "}
            {summary.duplicates} duplicates · {summary.rowsSkipped} skipped
          </p>
          <p>
            {summary.tradesFormed} trades formed · {summary.openPositions} open positions
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Note: Console tradebooks don&apos;t say MIS vs CNC, so product-based splits are
            unavailable for these imports.
          </p>
          {summary.warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-600 dark:text-amber-500">
              {summary.warnings.map((w) => (
                <li key={`${w.code}:${w.message}`}>
                  {w.message}
                  {w.count > 1 ? ` (×${w.count})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
