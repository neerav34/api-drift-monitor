import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  processCheckResult,
  type RawCheckResult,
} from "@/lib/checks/process-check-result";

interface IngestBody {
  results: RawCheckResult[];
}

/**
 * The one endpoint self-hosted checkers talk to. Auth is a per-API
 * webhook_token (not a Supabase session) sent as a bearer token -- the
 * checker running in the user's own CI never has, and never needs, a
 * Supabase login. Only a diff result crosses this boundary, never
 * credentials.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.results) || body.results.length === 0) {
    return NextResponse.json(
      { error: '"results" must be a non-empty array' },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  const { data: api, error } = await supabase
    .from("apis")
    .select("id, name, github_repo, alert_webhook, is_active")
    .eq("webhook_token", token)
    .maybeSingle();

  if (error || !api) {
    return NextResponse.json({ error: "Unknown webhook token" }, { status: 401 });
  }
  if (!api.is_active) {
    return NextResponse.json({ error: "This API is paused" }, { status: 403 });
  }

  const processed = [];
  for (const result of body.results) {
    processed.push(await processCheckResult(supabase, api, result));
  }

  await supabase
    .from("apis")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", api.id);

  return NextResponse.json({ processed: processed.length, results: processed });
}
