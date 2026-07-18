import { APP_NAME } from "@zuo/types";

export function GET() {
  // Supabase reachability lands in phase 0.4 once the project + env vars exist.
  return Response.json({ ok: true, app: APP_NAME });
}
