import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Owner-only, same reasoning as POST /collaborators. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/apis/[id]/collaborators/[userId]">
) {
  const { id, userId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: api } = await supabase.from("apis").select("id, user_id").eq("id", id).maybeSingle();
  if (!api) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (api.user_id !== user.id) {
    return NextResponse.json(
      { error: "Only the owner can remove collaborators" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("api_collaborators")
    .delete()
    .eq("api_id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That user isn't a collaborator on this API" }, { status: 404 });
  }
  return NextResponse.json({ removed: true });
}
