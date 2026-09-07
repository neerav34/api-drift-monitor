#!/usr/bin/env tsx
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { runHostedCheck } from "../lib/checks/run-hosted-check";
import { processCheckResult } from "../lib/checks/process-check-result";
import { parseIntervalMs } from "../lib/checks/parse-interval";
import { sendDeadMansSwitchAlert } from "../lib/alerts/dead-mans-switch";

const DEAD_MANS_SWITCH_MULTIPLIER = 2; // fire once check_interval has been missed twice over
const DEAD_MANS_SWITCH_THROTTLE_MS = 24 * 60 * 60 * 1000; // at most one alert/day per API
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";

/**
 * Hosted-mode batch checker, run on our own GitHub Actions schedule
 * (.github/workflows/check-apis.yml). Also runs the dead-man's-switch check
 * for every active API regardless of mode -- a self-hosted checker can go
 * quiet just as silently as a hosted one, and neither would ever produce a
 * drift alert to say so.
 */
async function main() {
  const supabase = createServiceRoleClient();

  const { data: apis, error } = await supabase
    .from("apis")
    .select(
      "id, name, base_url, spec_url, spec_mode, check_mode, auth_header_enc, github_repo, alert_webhook, check_interval, last_seen_at, last_dead_mans_alert_at"
    )
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load active APIs:", error.message);
    process.exitCode = 1;
    return;
  }

  let checked = 0;
  let deadMansAlerts = 0;

  for (const api of apis ?? []) {
    if (await checkDeadMansSwitch(supabase, api)) deadMansAlerts++;

    if (api.check_mode !== "hosted" || api.spec_mode === "mcp") continue;

    // The outer cron polls frequently (every 15 min); each API's own
    // check_interval decides how often it's actually due for a live check.
    const lastSeenMs = api.last_seen_at ? new Date(api.last_seen_at).getTime() : 0;
    if (Date.now() - lastSeenMs < parseIntervalMs(api.check_interval)) continue;

    const { data: endpoints } = await supabase
      .from("endpoints")
      .select("id, path, method, is_mutating, baseline_schema")
      .eq("api_id", api.id)
      .eq("is_mutating", false);

    for (const endpoint of endpoints ?? []) {
      const raw = await runHostedCheck(api, endpoint);
      await processCheckResult(supabase, api, raw);
      checked++;
    }

    await supabase
      .from("apis")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", api.id);
  }

  console.log(
    `Checked ${checked} endpoint(s) across ${apis?.length ?? 0} active API(s). Sent ${deadMansAlerts} dead-man's-switch alert(s).`
  );
}

/** Returns true if an alert was actually sent this run. */
async function checkDeadMansSwitch(
  supabase: ReturnType<typeof createServiceRoleClient>,
  api: {
    id: string;
    name: string;
    alert_webhook: string | null;
    check_interval: string;
    last_seen_at: string | null;
    last_dead_mans_alert_at: string | null;
  }
): Promise<boolean> {
  if (!api.alert_webhook) return false;

  const thresholdMs = parseIntervalMs(api.check_interval) * DEAD_MANS_SWITCH_MULTIPLIER;
  const lastSeenMs = api.last_seen_at ? new Date(api.last_seen_at).getTime() : 0;
  const isOverdue = Date.now() - lastSeenMs > thresholdMs;
  if (!isOverdue) return false;

  const alreadyAlertedRecently =
    api.last_dead_mans_alert_at &&
    Date.now() - new Date(api.last_dead_mans_alert_at).getTime() < DEAD_MANS_SWITCH_THROTTLE_MS;
  if (alreadyAlertedRecently) return false;

  try {
    await sendDeadMansSwitchAlert(
      api.alert_webhook,
      api.name,
      `${DASHBOARD_URL}/dashboard/apis/${api.id}`
    );
    await supabase
      .from("apis")
      .update({ last_dead_mans_alert_at: new Date().toISOString() })
      .eq("id", api.id);
    return true;
  } catch (err) {
    console.error(`Dead man's switch alert failed for ${api.name}:`, err);
    return false;
  }
}

main();
