import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client that bypasses RLS entirely. Only for trusted
 * server-side paths: the self-hosted ingest endpoint (authenticated via
 * webhook_token instead of a user session) and the hosted-mode batch
 * checker. Never import this into anything reachable from the browser.
 *
 * Kept in its own file (no `next/headers` import) so the standalone
 * hosted-mode batch script (scripts/check-all-apis.ts, run via plain
 * node/tsx outside the Next.js runtime) can use it without pulling in
 * anything that assumes a Next.js request context.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
