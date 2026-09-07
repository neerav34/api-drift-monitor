import { formatDriftLine, type DriftAlert } from "./types";

export async function sendSlackAlert(webhookUrl: string, alert: DriftAlert) {
  const summaryLine = alert.llmSummary
    ? `_${alert.llmSummary}_`
    : `*${alert.apiName}* is drifting from its spec.`;

  const causeLine = alert.correlatedCommit
    ? `Likely cause: commit \`${alert.correlatedCommit}\``
    : undefined;

  const payload = {
    text: `🚨 API Drift: ${alert.apiName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 API Drift Detected", emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: summaryLine },
      },
      ...(causeLine
        ? [{ type: "context", elements: [{ type: "mrkdwn", text: causeLine }] }]
        : []),
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Endpoint:*\n\`${alert.endpointMethod} ${alert.endpointPath}\``,
          },
          {
            type: "mrkdwn",
            text: `*Issues:*\n${alert.driftDetails.length} field(s) mismatched`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: alert.driftDetails.map(formatDriftLine).join("\n"),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Dashboard" },
            url: alert.dashboardUrl,
            style: "primary",
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Slack alert failed: ${res.status}`);
}
