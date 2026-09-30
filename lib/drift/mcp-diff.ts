import type { DriftItem } from "./diff";

/**
 * MCP servers rarely publish OpenAPI-style docs, so there's no external
 * spec to diff against -- instead we snapshot the `tools/list` response on
 * every check and diff it against the previous snapshot.
 */
export interface McpToolSnapshot {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, { type?: string | string[]; enum?: unknown[] }>;
    required?: string[];
  };
}

export interface McpDriftItem {
  type:
    | "tool_added"
    | "tool_removed"
    | "param_added"
    | "param_removed"
    | "param_type_changed"
    | "param_required_changed";
  tool: string;
  field?: string;
  expected?: string;
  got?: string;
}

export function diffMcpSnapshots(
  previous: McpToolSnapshot[],
  current: McpToolSnapshot[]
): McpDriftItem[] {
  const prevByName = new Map(previous.map((t) => [t.name, t]));
  const currByName = new Map(current.map((t) => [t.name, t]));
  const drift: McpDriftItem[] = [];

  for (const name of prevByName.keys()) {
    if (!currByName.has(name)) {
      drift.push({ type: "tool_removed", tool: name });
    }
  }

  for (const [name, currTool] of currByName) {
    const prevTool = prevByName.get(name);
    if (!prevTool) {
      drift.push({ type: "tool_added", tool: name });
      continue;
    }
    drift.push(...diffToolSchema(name, prevTool, currTool));
  }

  return drift;
}

function diffToolSchema(
  tool: string,
  prev: McpToolSnapshot,
  curr: McpToolSnapshot
): McpDriftItem[] {
  const drift: McpDriftItem[] = [];
  const prevProps = prev.inputSchema?.properties ?? {};
  const currProps = curr.inputSchema?.properties ?? {};
  const prevRequired = new Set(prev.inputSchema?.required ?? []);
  const currRequired = new Set(curr.inputSchema?.required ?? []);

  const allParams = new Set([...Object.keys(prevProps), ...Object.keys(currProps)]);
  for (const param of allParams) {
    const prevParam = prevProps[param];
    const currParam = currProps[param];

    if (prevParam && !currParam) {
      drift.push({ type: "param_removed", tool, field: param });
      continue;
    }
    if (!prevParam && currParam) {
      drift.push({ type: "param_added", tool, field: param });
      continue;
    }
    if (!prevParam || !currParam) continue;

    const prevType = describeParamType(prevParam);
    const currType = describeParamType(currParam);
    if (prevType !== currType) {
      drift.push({
        type: "param_type_changed",
        tool,
        field: param,
        expected: prevType,
        got: currType,
      });
    }

    if (prevRequired.has(param) !== currRequired.has(param)) {
      drift.push({
        type: "param_required_changed",
        tool,
        field: param,
        expected: prevRequired.has(param) ? "required" : "optional",
        got: currRequired.has(param) ? "required" : "optional",
      });
    }
  }

  return drift;
}

function describeParamType(schema?: { type?: string | string[]; enum?: unknown[] }): string {
  if (!schema) return "unknown";
  if (schema.enum) return "enum";
  if (Array.isArray(schema.type)) return schema.type.join("|");
  return schema.type ?? "unknown";
}

/** Calls an MCP server's JSON-RPC `tools/list` -- shared by the self-hosted
 * CLI and the hosted-mode checker so both snapshot tools the same way. */
export async function fetchMcpTools(baseUrl: string): Promise<McpToolSnapshot[]> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (!res.ok) throw new Error(`MCP tools/list request failed: ${res.status}`);
  const body = (await res.json()) as { result?: { tools?: McpToolSnapshot[] } };
  return body.result?.tools ?? [];
}

/** Maps an MCP-specific drift item onto the generic DriftItem shape the rest
 * of the pipeline (alerts, LLM summaries, ignore filtering) already knows
 * how to render, so MCP results don't need their own alert formatting. */
export function mcpDriftItemToDriftItem(item: McpDriftItem): DriftItem {
  const field = item.field ?? item.tool;
  switch (item.type) {
    case "tool_removed":
    case "param_removed":
      return { type: "missing", field };
    case "param_type_changed":
      return { type: "wrongType", field, expected: item.expected, got: item.got };
    default:
      return { type: "invalid", field, expected: item.type };
  }
}
