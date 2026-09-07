import type { SupabaseClient } from "@supabase/supabase-js";
import { filterDrift, type DriftItem } from "@/lib/drift/diff";
import { findNearestCommit, formatCommitLabel } from "@/lib/deploy-correlation/github";
import { summarizeDrift } from "@/lib/llm-summary/summarize";
import { sendSlackAlert } from "@/lib/alerts/slack";
import { sendDiscordAlert } from "@/lib/alerts/discord";
import type { DriftAlert } from "@/lib/alerts/types";

export interface RawCheckResult {
  path: string;
  method: string;
  status: "ok" | "drift" | "error" | "timeout";
  responseStatusCode?: number;
  responseTimeMs?: number;
  drift?: DriftItem[];
}

export interface ApiForProcessing {
  id: string;
  name: string;
  github_repo: string | null;
  alert_webhook: string | null;
}

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";

/**
 * The one place that turns a raw check result (from the self-hosted CLI via
 * /api/ingest, the hosted batch checker, or a manual "Check Now") into
 * everything downstream: drift_ignores filtering, deploy correlation, an
 * LLM summary, a check_runs row, the endpoint's last-known status, and an
 * alert. Called from three places, so it lives here instead of being
 * copied into each route.
 */
export async function processCheckResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  api: ApiForProcessing,
  result: RawCheckResult
) {
  const endpoint = await upsertEndpoint(supabase, api.id, result.path, result.method);

  const { data: ignores } = await supabase
    .from("drift_ignores")
    .select("field_path")
    .eq("endpoint_id", endpoint.id);
  const ignoredFields = (ignores ?? []).map((i: { field_path: string }) => i.field_path);

  const filteredDrift = result.drift ? filterDrift(result.drift, ignoredFields) : [];
  const finalStatus: RawCheckResult["status"] =
    result.status === "error" || result.status === "timeout"
      ? result.status
      : filteredDrift.length > 0
        ? "drift"
        : "ok";

  let correlatedCommit: string | undefined;
  let llmSummary: string | undefined;

  if (finalStatus === "drift") {
    if (api.github_repo) {
      try {
        const commit = await findNearestCommit(
          api.github_repo,
          new Date(),
          process.env.GITHUB_APP_TOKEN
        );
        if (commit) correlatedCommit = formatCommitLabel(commit);
      } catch (err) {
        console.error("Deploy correlation failed:", err);
      }
    }

    llmSummary = await summarizeDrift({
      apiName: api.name,
      endpointMethod: result.method,
      endpointPath: result.path,
      driftDetails: filteredDrift,
    });
  }

  await supabase.from("check_runs").insert({
    endpoint_id: endpoint.id,
    status: finalStatus,
    response_status_code: result.responseStatusCode ?? null,
    response_time_ms: result.responseTimeMs ?? null,
    drift_details: filteredDrift.length ? filteredDrift : null,
    llm_summary: llmSummary ?? null,
    correlated_commit: correlatedCommit ?? null,
  });

  await supabase
    .from("endpoints")
    .update({
      last_status: finalStatus,
      last_checked_at: new Date().toISOString(),
      last_drift_details: filteredDrift.length ? filteredDrift : null,
    })
    .eq("id", endpoint.id);

  if ((finalStatus === "drift" || finalStatus === "error") && api.alert_webhook) {
    const alert: DriftAlert = {
      apiName: api.name,
      apiId: api.id,
      endpointPath: result.path,
      endpointMethod: result.method,
      llmSummary,
      correlatedCommit,
      driftDetails: filteredDrift,
      dashboardUrl: `${DASHBOARD_URL}/dashboard/apis/${api.id}`,
    };
    try {
      if (api.alert_webhook.includes("discord.com")) {
        await sendDiscordAlert(api.alert_webhook, alert);
      } else {
        await sendSlackAlert(api.alert_webhook, alert);
      }
    } catch (err) {
      console.error("Alert delivery failed:", err);
    }
  }

  return { endpointId: endpoint.id as string, status: finalStatus };
}

async function upsertEndpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  apiId: string,
  path: string,
  method: string
): Promise<{ id: string }> {
  const normalizedMethod = method.toUpperCase();

  const { data: existing } = await supabase
    .from("endpoints")
    .select("id")
    .eq("api_id", apiId)
    .eq("path", path)
    .eq("method", normalizedMethod)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("endpoints")
    .insert({
      api_id: apiId,
      path,
      method: normalizedMethod,
      is_mutating: !["GET", "HEAD"].includes(normalizedMethod),
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create endpoint: ${error?.message}`);
  }
  return created;
}
