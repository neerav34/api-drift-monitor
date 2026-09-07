import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeBadgeState } from "@/lib/badge/status";
import { renderBadgeSvg, BADGE_COLORS } from "@/lib/badge/render";

export const dynamic = "force-dynamic";

/** Public by design -- an API's health status isn't sensitive, and this is
 * meant to be dropped into a public README as an embeddable badge. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/badge/[id]">
) {
  const { id } = await ctx.params;
  const supabase = createServiceRoleClient();

  const { data: endpoints } = await supabase
    .from("endpoints")
    .select("id, last_status")
    .eq("api_id", id);

  const endpointIds = (endpoints ?? []).map((e) => e.id as string);
  const endpointStatuses = (endpoints ?? []).map((e) => e.last_status as string);

  let lastBadRunAt: string | null = null;
  let firstRunAt: string | null = null;

  if (endpointIds.length > 0) {
    const { data: lastBad } = await supabase
      .from("check_runs")
      .select("checked_at")
      .in("endpoint_id", endpointIds)
      .neq("status", "ok")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastBadRunAt = lastBad?.checked_at ?? null;

    const { data: first } = await supabase
      .from("check_runs")
      .select("checked_at")
      .in("endpoint_id", endpointIds)
      .order("checked_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    firstRunAt = first?.checked_at ?? null;
  }

  const state = computeBadgeState({ endpointStatuses, lastBadRunAt, firstRunAt });
  const svg = renderBadgeSvg("api drift", state.message, BADGE_COLORS[state.color]);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}
