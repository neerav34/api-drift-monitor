import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runHostedCheck } from "@/lib/checks/run-hosted-check";
import { runHostedMcpCheck } from "@/lib/checks/run-hosted-mcp-check";
import { processCheckResult } from "@/lib/checks/process-check-result";

/** Manual "Check Now" button -- hosted mode only. Self-hosted APIs have no
 * server-side credentials to check with; their next result comes from the
 * user's own scheduled CI run. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/apis/[id]/check">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: api, error: apiError } = await supabase
    .from("apis")
    .select(
      "id, name, base_url, spec_url, spec_mode, check_mode, auth_header_enc, github_repo, alert_webhook, alert_email, mcp_snapshot"
    )
    .eq("id", id)
    .maybeSingle();

  if (apiError || !api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (api.check_mode !== "hosted") {
    return NextResponse.json(
      { error: "Manual checks are only available in hosted mode" },
      { status: 400 }
    );
  }

  if (api.spec_mode === "mcp") {
    const { results, newSnapshot } = await runHostedMcpCheck(api);
    const processed = [];
    for (const result of results) {
      processed.push(await processCheckResult(supabase, api, result));
    }
    await supabase
      .from("apis")
      .update({ mcp_snapshot: newSnapshot, last_seen_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ checked: processed.length, results: processed });
  }

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("id, path, method, is_mutating, baseline_schema")
    .eq("api_id", id)
    .eq("is_mutating", false);

  if (!endpoints || endpoints.length === 0) {
    return NextResponse.json(
      { error: "No non-mutating endpoints to check yet" },
      { status: 400 }
    );
  }

  const results = [];
  for (const endpoint of endpoints) {
    const raw = await runHostedCheck(api, endpoint);
    results.push(await processCheckResult(supabase, api, raw));
  }

  await supabase
    .from("apis")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ checked: results.length, results });
}
