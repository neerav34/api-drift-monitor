import type { RawCheckResult } from "../../../lib/checks/process-check-result";

/** The only thing that leaves the runner: a pass/fail + diff per endpoint. */
export async function reportResults(
  ingestUrl: string,
  webhookToken: string,
  results: RawCheckResult[]
): Promise<void> {
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${webhookToken}`,
    },
    body: JSON.stringify({ results }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ingest request failed: ${res.status} ${text}`);
  }
}
