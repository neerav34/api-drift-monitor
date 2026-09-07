import { formatDriftLine, type DriftAlert } from "./types";

const DRIFT_RED = 0xe01e5a;

export async function sendDiscordAlert(webhookUrl: string, alert: DriftAlert) {
  const description = [
    alert.llmSummary
      ? `_${alert.llmSummary}_`
      : `**${alert.apiName}** is drifting from its spec.`,
    alert.correlatedCommit ? `Likely cause: \`${alert.correlatedCommit}\`` : null,
    "",
    ...alert.driftDetails.map(formatDriftLine),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const payload = {
    content: `🚨 API Drift: ${alert.apiName}`,
    embeds: [
      {
        title: `${alert.endpointMethod} ${alert.endpointPath}`,
        description,
        color: DRIFT_RED,
        url: alert.dashboardUrl,
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Discord alert failed: ${res.status}`);
}
