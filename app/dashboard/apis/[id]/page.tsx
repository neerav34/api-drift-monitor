import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { CheckNowButton } from "@/components/check-now-button";
import { CopyableCode } from "@/components/copyable-code";
import { IgnoreFieldButton } from "@/components/ignore-field-button";

interface DriftDetail {
  type: string;
  field: string;
  expected?: string;
  got?: string;
}

export default async function ApiDetailPage(props: PageProps<"/dashboard/apis/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: api } = await supabase.from("apis").select("*").eq("id", id).maybeSingle();
  if (!api) notFound();

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("id, path, method, last_status, last_checked_at, last_drift_details")
    .eq("api_id", id)
    .order("path");

  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";
  const badgeMarkdown = `![status](${dashboardUrl}/api/badge/${api.id})`;
  const initCommand = [
    "npx api-drift-check init",
    `--base-url ${api.base_url}`,
    `--ingest-url ${dashboardUrl}/api/ingest`,
    `--spec-mode ${api.spec_mode}`,
    api.spec_url ? `--spec-url ${api.spec_url}` : undefined,
  ]
    .filter(Boolean)
    .join(" \\\n  ");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{api.name}</h1>
          <p className="text-sm text-neutral-500">{api.base_url}</p>
        </div>
        <StatusPill
          endpointStatuses={(endpoints ?? []).map((e) => e.last_status as string)}
        />
      </div>

      {api.check_mode === "hosted" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Manual check</h2>
          <CheckNowButton apiId={api.id} />
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Self-hosted setup</h2>
          <p className="text-sm text-neutral-500">
            Run this once in your own repo, then add the webhook token below
            as a GitHub Actions secret named{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              API_DRIFT_WEBHOOK_TOKEN
            </code>
            .
          </p>
          <CopyableCode code={initCommand} />
          <p className="text-sm text-neutral-500">Webhook token:</p>
          <CopyableCode code={api.webhook_token} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Contract-health badge</h2>
        <p className="text-sm text-neutral-500">Drop this into a public README:</p>
        <CopyableCode code={badgeMarkdown} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Endpoints</h2>
        {!endpoints || endpoints.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No results yet -- {api.check_mode === "hosted" ? 'run a manual check or wait for the next scheduled one.' : "run the checker in your repo, or wait for its next scheduled run."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {endpoints.map((endpoint) => {
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
                    <ul className="space-y-1 pl-4">
                      {drift.map((d) => (
                        <li
                          key={d.field}
                          className="flex items-center justify-between gap-4 text-xs text-neutral-600 dark:text-neutral-400"
                        >
                          <span>
                            {d.type} on <code>{d.field}</code>
                            {d.expected &&
                              ` (expected ${d.expected}${d.got ? `, got ${d.got}` : ""})`}
                          </span>
                          <IgnoreFieldButton endpointId={endpoint.id} fieldPath={d.field} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
