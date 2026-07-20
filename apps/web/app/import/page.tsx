import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportClient } from "./import-client";

interface TradeListRow {
  id: string;
  instrument_key: string;
  direction: string;
  quantity: number;
  opened_at: string;
  closed_at: string | null;
  gross_pnl_paise: number | null;
  charges_paise: number | null;
  net_pnl_paise: number | null;
}

function formatPaise(paise: number | null): string {
  if (paise === null) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
}

export default async function ImportPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("trades")
    .select(
      "id, instrument_key, direction, quantity, opened_at, closed_at, gross_pnl_paise, charges_paise, net_pnl_paise",
    )
    .order("opened_at", { ascending: false })
    .limit(50);
  const trades = (data ?? []) as TradeListRow[];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-mono text-2xl font-bold">Import tradebook</h1>
        <div className="flex items-baseline gap-4">
          <Link href="/dashboard" className="text-sm text-zinc-500 underline hover:text-zinc-300">
            Dashboard →
          </Link>
          <span className="text-sm text-zinc-500">{user.email}</span>
        </div>
      </header>

      <ImportClient />

      <section>
        <h2 className="mb-2 font-mono text-lg">Trades ({trades.length})</h2>
        {trades.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No trades yet — upload a Zerodha Console tradebook (CSV or XLSX) above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-4">Instrument</th>
                  <th className="py-1 pr-4">Dir</th>
                  <th className="py-1 pr-4">Qty</th>
                  <th className="py-1 pr-4">Opened (IST)</th>
                  <th className="py-1 pr-4">Status</th>
                  <th className="py-1 pr-4">Net P&L</th>
                  <th className="py-1 pr-4">Charges</th>
                  <th className="py-1">Gross</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-1 pr-4">{t.instrument_key}</td>
                    <td className="py-1 pr-4">{t.direction}</td>
                    <td className="py-1 pr-4">{t.quantity}</td>
                    <td className="py-1 pr-4">{formatIst(t.opened_at)}</td>
                    <td className="py-1 pr-4">{t.closed_at ? "closed" : "open"}</td>
                    <td className="py-1 pr-4 font-semibold">{formatPaise(t.net_pnl_paise)}</td>
                    <td className="py-1 pr-4">{formatPaise(t.charges_paise)}</td>
                    <td className="py-1 text-zinc-500">{formatPaise(t.gross_pnl_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Net P&L = gross − estimated charges. Charges are estimates: Console
          tradebooks don&apos;t say MIS vs CNC, so equity days are inferred (matched
          quantity intraday, remainder delivery). &quot;—&quot; means no charge-rate table
          covers that trade&apos;s date yet, or the position is still open.
        </p>
      </section>
    </main>
  );
}
