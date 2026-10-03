import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findUserByEmail } from "@/lib/supabase/find-user-by-email";

interface AddCollaboratorBody {
  email: string;
}

/** Owner-only, enforced here at the application layer AND by the
 * api_collaborators insert policy (only the owner passes that policy's
 * check) -- this is a deliberate business rule, not just a data-ownership
 * boundary, so it gets checked in both places. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/apis/[id]/collaborators">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: collaborators, error } = await supabase
    .from("api_collaborators")
    .select("id, user_id, email, added_by, created_at")
    .eq("api_id", id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborators: collaborators ?? [] });
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/apis/[id]/collaborators">
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: api } = await supabase.from("apis").select("id, user_id").eq("id", id).maybeSingle();
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (api.user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the owner can add collaborators" },
      { status: 403 }
    );
  }

  let body: AddCollaboratorBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.email) {
    return NextResponse.json({ error: '"email" is required' }, { status: 400 });
  }

  const target = await findUserByEmail(body.email);
  if (!target) {
    return NextResponse.json(
      { error: "No account found for that email -- ask them to sign up first, then share again" },
      { status: 404 }
    );
  }
  if (target.id === user.id) {
    return NextResponse.json({ error: "You already own this API" }, { status: 400 });
  }

  const { error } = await supabase
    .from("api_collaborators")
    .insert({ api_id: id, user_id: target.id, email: target.email, added_by: user.id });

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique violation -- already a collaborator
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ added: true }, { status: 201 });
}
