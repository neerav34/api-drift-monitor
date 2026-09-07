import { describe, expect, it } from "vitest";
import { diffMcpSnapshots, type McpToolSnapshot } from "./mcp-diff";

describe("diffMcpSnapshots", () => {
  it("flags a param type change, matching the guide's example alert", () => {
    const previous: McpToolSnapshot[] = [
      {
        name: "search_orders",
        inputSchema: {
          properties: { status: { enum: ["open", "closed"] } },
          required: ["status"],
        },
      },
    ];
    const current: McpToolSnapshot[] = [
      {
        name: "search_orders",
        inputSchema: {
          properties: { status: { type: "string" } },
          required: ["status"],
        },
      },
    ];

    const drift = diffMcpSnapshots(previous, current);
    expect(drift).toContainEqual({
      type: "param_type_changed",
      tool: "search_orders",
      field: "status",
      expected: "enum",
      got: "string",
    });
  });

  it("flags a removed tool", () => {
    const previous: McpToolSnapshot[] = [{ name: "delete_order" }];
    const drift = diffMcpSnapshots(previous, []);
    expect(drift).toContainEqual({ type: "tool_removed", tool: "delete_order" });
  });

  it("flags an added tool", () => {
    const current: McpToolSnapshot[] = [{ name: "new_tool" }];
    const drift = diffMcpSnapshots([], current);
    expect(drift).toContainEqual({ type: "tool_added", tool: "new_tool" });
  });

  it("returns no drift for identical snapshots", () => {
    const snapshot: McpToolSnapshot[] = [
      { name: "search_orders", inputSchema: { properties: { status: { type: "string" } } } },
    ];
    expect(diffMcpSnapshots(snapshot, snapshot)).toEqual([]);
  });
});
