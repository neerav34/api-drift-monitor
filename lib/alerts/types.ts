import type { DriftItem } from "@/lib/drift/diff";

export interface DriftAlert {
  apiName: string;
  apiId: string;
  endpointPath: string;
  endpointMethod: string;
  llmSummary?: string;
  correlatedCommit?: string;
  driftDetails: DriftItem[];
  dashboardUrl: string;
}

export function formatDriftLine(d: DriftItem): string {
  switch (d.type) {
    case "missing":
      return `• ❌ Missing: \`${d.field}\``;
    case "wrongType":
      return `• ⚠️ \`${d.field}\`: expected ${d.expected}, got ${d.got}`;
    case "wrongFormat":
      return `• ⚠️ \`${d.field}\`: expected format ${d.expected}`;
    default:
      return `• ⚠️ \`${d.field}\`: ${d.expected}`;
  }
}
