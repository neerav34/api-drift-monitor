import { Resend } from "resend";
import { formatDriftLine, type DriftAlert } from "./types";

// Resend's own sandbox sender -- works out of the box with no domain
// verification, unlike most providers' "from" requirements. Override with
// RESEND_FROM_EMAIL once a verified sending domain exists.
const DEFAULT_FROM = "API Drift Monitor <onboarding@resend.dev>";

export async function sendEmailAlert(toEmail: string, alert: DriftAlert): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);

  const summaryLine = alert.llmSummary ?? `${alert.apiName} is drifting from its spec.`;
  const causeLine = alert.correlatedCommit
    ? `<p style="color:#666;font-size:13px;margin:4px 0;">Likely cause: commit <code>${escapeHtml(alert.correlatedCommit)}</code></p>`
    : "";
  const driftItems = alert.driftDetails
    .map((d) => `<li>${escapeHtml(formatDriftLine(d).replace(/^•\s*/, ""))}</li>`)
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin-bottom: 4px;">🚨 API Drift: ${escapeHtml(alert.apiName)}</h2>
      <p style="margin: 8px 0;">${escapeHtml(summaryLine)}</p>
      ${causeLine}
      <p style="margin: 12px 0 4px;"><strong>Endpoint:</strong> <code>${escapeHtml(alert.endpointMethod)} ${escapeHtml(alert.endpointPath)}</code></p>
      <ul style="margin: 4px 0; padding-left: 20px;">${driftItems}</ul>
      <p style="margin-top: 16px;"><a href="${alert.dashboardUrl}">View Dashboard</a></p>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
    to: toEmail,
    subject: `🚨 API Drift: ${alert.apiName}`,
    html,
  });

  if (error) throw new Error(`Email alert failed: ${error.message}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
