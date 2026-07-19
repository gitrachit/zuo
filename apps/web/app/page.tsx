import { APP_NAME, EXCHANGES } from "@zuo/types";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-mono text-5xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="max-w-md text-center text-zinc-500 dark:text-zinc-400">
        AI trading journal + copilot for Indian traders. Charges-aware net P&amp;L,
        deterministic analytics, your own numbers narrated back to you.
      </p>
      <ul className="flex flex-wrap justify-center gap-2 font-mono text-sm">
        {EXCHANGES.map((exchange) => (
          <li
            key={exchange}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            {exchange}
          </li>
        ))}
      </ul>
    </main>
  );
}
