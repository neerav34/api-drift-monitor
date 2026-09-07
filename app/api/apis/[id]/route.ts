import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptAuthHeader } from "@/lib/crypto/encrypt";

interface UpdateApiBody {
  name?: string;
  base_url?: string;
  spec_url?: string;
  alert_webhook?: string;
  github_repo?: string;
  check_interval?: string;
  is_active?: boolean;
  auth_header?: string; // plaintext -- re-encrypted before storage, hosted mode only
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/apis/[id]">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: api, error } = await supabase
    .from("apis")
    .select(
      "id, name, base_url, spec_url, spec_mode, check_mode, check_interval, alert_webhook, github_repo, is_active, last_seen_at, created_at, webhook_token"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !api) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("id, path, method, is_mutating, last_status, last_checked_at, last_drift_details")
    .eq("api_id", id)
    .order("path");

  return NextResponse.json({ api, endpoints: endpoints ?? [] });
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/apis/[id]">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  let body: UpdateApiBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {};
  for (const key of [
    "name",
    "base_url",
    "spec_url",
    "alert_webhook",
    "github_repo",
    "check_interval",
    "is_active",
  ] as const) {
    if (body[key] !== undefined) updatePayload[key] = body[key];
  }
  if (body.auth_header) {
    const encrypted = encryptAuthHeader(body.auth_header);
    updatePayload.auth_header_enc = `\\x${encrypted.toString("hex")}`;
  }

  const { data: api, error } = await supabase
    .from("apis")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !api) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }
  return NextResponse.json({ api });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/apis/[id]">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { error } = await supabase.from("apis").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
