"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else router.push("/import");
  }

  async function signUp() {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (data.session) router.push("/import");
    else setMessage("Check your email for a confirmation link, then sign in.");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-mono text-3xl font-bold">Zuo</h1>
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <input
          type="email"
          required
          placeholder="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="password (min 8 chars)"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-zinc-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signUp()}
          className="rounded border border-zinc-300 px-3 py-2 disabled:opacity-50 dark:border-zinc-700"
        >
          Create account
        </button>
        {message && <p className="text-sm text-zinc-500">{message}</p>}
      </form>
    </main>
  );
}
