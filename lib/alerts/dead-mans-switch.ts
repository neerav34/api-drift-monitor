/**
 * Fires when an API's checker has gone quiet for too long -- catches a
 * silently-broken GitHub Actions cron (self-hosted or hosted) that a
 * drift alert alone would never surface, since no result means no drift
 * alert either.
 */
export async function sendDeadMansSwitchAlert(
  webhookUrl: string,
  apiName: string,
  dashboardUrl: string
): Promise<void> {
  const text = `⏰ We haven't heard from the checker for *${apiName}* in a while. Is it still running?`;
  const isDiscord = webhookUrl.includes("discord.com");

  const payload = isDiscord
    ? { content: `${text}\n${dashboardUrl}` }
    : { text: `${text}\n<${dashboardUrl}|View Dashboard>` };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Dead man's switch alert failed: ${res.status}`);
}
