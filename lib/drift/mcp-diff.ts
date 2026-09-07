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
