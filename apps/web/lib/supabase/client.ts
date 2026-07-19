"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase env vars are not configured");
  return createBrowserClient(env.url, env.anonKey);
}
