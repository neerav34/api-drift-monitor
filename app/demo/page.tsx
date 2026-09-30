import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { StatusPill } from "@/components/status-pill";
import { CheckHistoryChart } from "@/components/check-history-chart";
import { buildDailyHistory } from "@/lib/history/daily-status";

const HISTORY_DAYS = 30;

// Otherwise Next.js prerenders this at build time and freezes the demo's
// status/history as of the last deploy instead of showing live data.
export const dynamic = "force-dynamic";

interface DriftDetail {
  type: string;
  field: string;
  expected?: string;
  got?: string;
}

/**
 * Public, unauthenticated -- showcases a real monitored API (configured via
 * DEMO_API_ID) so a visitor can see the product actually working without
 * signing up. Deliberately selects only non-secret columns: never
 * webhook_token or auth_header_enc. Uses the service-role client since
 * there's no signed-in session to scope RLS to -- this route is the one
 * place besides /api/badge where that's the correct, intentional choice.
 */
export default async function DemoPage() {
  const demoApiId = process.env.DEMO_API_ID;

  if (!demoApiId) {
    return (
      <Shell>
        <p className="text-sm text-neutral-500">
          No live demo is configured right now.{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>{" "}
          to add your own API instead.
        </p>
      </Shell>
    );
  }

  const supabase = createServiceRoleClient();
  const { data: api } = await supabase
    .from("apis")
    .select("id, name, base_url, check_mode, is_active")
    .eq("id", demoApiId)
    .maybeSingle();

  if (!api) {
    return (
      <Shell>
        <p className="text-sm text-neutral-500">The configured demo API couldn&apos;t be found.</p>
      </Shell>
    );
  }

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("id, path, method, last_status, last_checked_at, last_drift_details")
    .eq("api_id", api.id)
    .order("path");

  const endpointIds = (endpoints ?? []).map((e) => e.id);
  const historyByEndpoint = new Map<string, ReturnType<typeof buildDailyHistory>>();
  if (endpointIds.length > 0) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (HISTORY_DAYS - 1));
    const { data: recentRuns } = await supabase
      .from("check_runs")
      .select("endpoint_id, status, checked_at")
      .in("endpoint_id", endpointIds)
      .gte("checked_at", since.toISOString());

    for (const endpointId of endpointIds) {
      const runsForEndpoint = (recentRuns ?? []).filter((r) => r.endpoint_id === endpointId);
      historyByEndpoint.set(endpointId, buildDailyHistory(runsForEndpoint, HISTORY_DAYS));
    }
  }

  return (
    <Shell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{api.name}</h1>
          <p className="text-sm text-neutral-500">{api.base_url}</p>
        </div>
        <StatusPill endpointStatuses={(endpoints ?? []).map((e) => e.last_status as string)} />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold">Endpoints</h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {(endpoints ?? []).map((endpoint) => {
            const drift = (endpoint.last_drift_details as DriftDetail[] | null) ?? [];
            return (
              <li key={endpoint.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">
                    {endpoint.method} {endpoint.path}
                  </span>
                  <StatusPill endpointStatuses={[endpoint.last_status as string]} />
                </div>
                {drift.length > 0 && (
                  <ul className="space-y-1 pl-4 text-xs text-neutral-600 dark:text-neutral-400">
                    {drift.map((d) => (
                      <li key={d.field}>
                        {d.type} on <code>{d.field}</code>
                        {d.expected && ` (expected ${d.expected}${d.got ? `, got ${d.got}` : ""})`}
                      </li>
                    ))}
                  </ul>
                )}
                <CheckHistoryChart buckets={historyByEndpoint.get(endpoint.id) ?? []} />
              </li>
            );
          })}
        </ul>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          API Drift Monitor
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <span className="text-neutral-500">Live demo — read only</span>
          <Link
            href="/signup"
            className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Sign up
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
