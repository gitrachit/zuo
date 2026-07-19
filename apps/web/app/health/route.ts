import { APP_NAME } from "@zuo/types";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

// Reachability, not client auth: hits Supabase's public auth health endpoint.
async function checkSupabase(): Promise<"connected" | "unreachable" | "not_configured"> {
  const env = getSupabaseEnv();
  if (!env) return "not_configured";
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.anonKey },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function GET() {
  const supabase = await checkSupabase();
  return Response.json(
    { ok: supabase !== "unreachable", app: APP_NAME, supabase },
    { status: supabase === "unreachable" ? 503 : 200 },
  );
}
