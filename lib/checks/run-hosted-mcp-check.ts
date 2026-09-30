import {
  diffMcpSnapshots,
  fetchMcpTools,
  mcpDriftItemToDriftItem,
  type McpToolSnapshot,
} from "@/lib/drift/mcp-diff";
import type { RawCheckResult } from "./process-check-result";

export interface HostedMcpApi {
  base_url: string;
  mcp_snapshot: McpToolSnapshot[] | null;
}

export interface HostedMcpCheckOutput {
  results: RawCheckResult[];
  /** Caller must persist this to `apis.mcp_snapshot` -- it's what the next
   * check diffs against. */
  newSnapshot: McpToolSnapshot[];
}

/**
 * Hosted-mode counterpart to the self-hosted CLI's MCP check
 * (packages/checker-agent/src/checks.ts's runMcpCheck) -- same JSON-RPC
 * call, same snapshot diff, same per-tool result shape (`path: "tool:${name}",
 * method: "MCP"`), so processCheckResult needs no MCP-specific branch at
 * all. The only real difference is where the previous snapshot lives: a
 * local state file for the CLI, `apis.mcp_snapshot` here, since a hosted
 * check has no local disk between runs.
 */
export async function runHostedMcpCheck(api: HostedMcpApi): Promise<HostedMcpCheckOutput> {
  const current = await fetchMcpTools(api.base_url);
  const previous = api.mcp_snapshot ?? [];

  // First-ever check for this API: nothing to diff against yet, so every
  // tool would otherwise show up as a false "tool_added" drift item. This
  // run establishes the baseline instead, same as baseline mode's own
  // first-sample-learns-not-diffs rule.
  if (previous.length === 0) {
    const results: RawCheckResult[] = current.map((tool) => ({
      path: `tool:${tool.name}`,
      method: "MCP",
      status: "ok",
    }));
    return { results, newSnapshot: current };
  }

  const drift = diffMcpSnapshots(previous, current);
  const toolNames = new Set([...previous.map((t) => t.name), ...current.map((t) => t.name)]);
  const results: RawCheckResult[] = [...toolNames].map((name) => {
    const toolDrift = drift.filter((d) => d.tool === name).map(mcpDriftItemToDriftItem);
    return {
      path: `tool:${name}`,
      method: "MCP",
      status: toolDrift.length > 0 ? "drift" : "ok",
      drift: toolDrift,
    };
  });

  return { results, newSnapshot: current };
}
