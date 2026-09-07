import { readFile, writeFile } from "node:fs/promises";
import type { McpToolSnapshot } from "../../../lib/drift/mcp-diff";

/**
 * Baseline schemas learned from live samples, and the last MCP tools/list
 * snapshot -- state that must persist across CI runs. The generated
 * workflow caches this file via actions/cache so a stateless runner still
 * has something to diff against on the next run.
 */
export interface CheckerState {
  baselines?: Record<string, unknown>;
  mcpSnapshot?: McpToolSnapshot[];
}

export const DEFAULT_STATE_PATH = ".api-drift-check-state.json";

export async function readState(statePath: string): Promise<CheckerState> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as CheckerState;
  } catch {
    return {};
  }
}

export async function writeState(
  statePath: string,
  state: CheckerState
): Promise<void> {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
