import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptAuthHeader } from "@/lib/crypto/encrypt";
import { extractEndpointsFromSpec } from "@/lib/drift/openapi";

interface CreateApiBody {
  name: string;
  base_url: string;
  spec_url?: string;
  spec_mode?: "openapi" | "mcp" | "baseline";
  check_mode?: "self_hosted" | "hosted";
  check_interval?: string;
  alert_webhook?: string;
  github_repo?: string;
  auth_header?: string; // plaintext, hosted mode only -- encrypted before storage, never stored as-is
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("apis")
    .select(
      "id, name, base_url, spec_mode, check_mode, check_interval, is_active, last_seen_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ apis: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateApiBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.base_url) {
    return NextResponse.json({ error: '"name" and "base_url" are required' }, { status: 400 });
  }

  const specMode = body.spec_mode ?? "baseline";
  const checkMode = body.check_mode ?? "self_hosted";

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    name: body.name,
    base_url: body.base_url,
    spec_url: body.spec_url ?? null,
    spec_mode: specMode,
    check_mode: checkMode,
    webhook_token: randomBytes(24).toString("hex"),
    check_interval: body.check_interval ?? "1 hour",
    alert_webhook: body.alert_webhook ?? null,
    github_repo: body.github_repo ?? null,
    // Seeded to now rather than left null -- otherwise the dead-man's-switch
    // check treats a brand-new, never-yet-checked API as having gone silent
    // since the epoch and fires an alert before it's had a chance to report in.
    last_seen_at: new Date().toISOString(),
  };

  if (checkMode === "hosted" && body.auth_header) {
    const encrypted = encryptAuthHeader(body.auth_header);
    insertPayload.auth_header_enc = `\\x${encrypted.toString("hex")}`;
  }

  const { data: api, error } = await supabase
    .from("apis")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !api) {
    return NextResponse.json({ error: error?.message ?? "Failed to create API" }, { status: 500 });
  }

  // Hosted + openapi: extract endpoints from the spec now so there's
  // something to check before the first live result ever comes in.
  // Self-hosted mode discovers endpoints from ingest results instead, since
  // the checker running in the user's own CI is the one with spec access.
  if (checkMode === "hosted" && specMode === "openapi" && body.spec_url) {
    try {
      const extracted = await extractEndpointsFromSpec(body.spec_url);
      if (extracted.length > 0) {
        await supabase.from("endpoints").insert(
          extracted.map((e) => ({
            api_id: api.id,
            path: e.path,
            method: e.method,
            operation_id: e.operationId ?? null,
            is_mutating: e.isMutating,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to extract endpoints from OpenAPI spec:", err);
    }
  }

  return NextResponse.json({ api }, { status: 201 });
}
