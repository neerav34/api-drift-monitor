import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface IgnoreBody {
  field_path: string;
  ignore_reason?: string;
}

/** Powers the "Not actually drift -- ignore this field" button. RLS (via the
 * drift_ignores -> endpoints -> apis join policy) is what actually enforces
 * that a user can only silence a field on their own endpoint. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/endpoints/[id]/ignore">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: IgnoreBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.field_path) {
    return NextResponse.json({ error: '"field_path" is required' }, { status: 400 });
  }

  const { error } = await supabase.from("drift_ignores").upsert(
    {
      endpoint_id: id,
      field_path: body.field_path,
      ignore_reason: body.ignore_reason ?? null,
    },
    { onConflict: "endpoint_id,field_path" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ignored: true });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/endpoints/[id]/ignore">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  let body: { field_path: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { error } = await supabase
    .from("drift_ignores")
    .delete()
    .eq("endpoint_id", id)
    .eq("field_path", body.field_path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ignored: false });
}
