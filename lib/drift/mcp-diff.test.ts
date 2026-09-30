import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diffMcpSnapshots,
  fetchMcpTools,
  mcpDriftItemToDriftItem,
  type McpToolSnapshot,
} from "./mcp-diff";

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

describe("mcpDriftItemToDriftItem", () => {
  it("maps a removed tool/param to missing", () => {
    expect(mcpDriftItemToDriftItem({ type: "tool_removed", tool: "delete_order" })).toEqual({
      type: "missing",
      field: "delete_order",
    });
  });

  it("maps a param type change to wrongType with expected/got preserved", () => {
    expect(
      mcpDriftItemToDriftItem({
        type: "param_type_changed",
        tool: "search_orders",
        field: "status",
        expected: "enum",
        got: "string",
      })
    ).toEqual({ type: "wrongType", field: "status", expected: "enum", got: "string" });
  });

  it("falls back to invalid for anything else, keeping the mcp type as context", () => {
    expect(
      mcpDriftItemToDriftItem({ type: "tool_added", tool: "new_tool" })
    ).toEqual({ type: "invalid", field: "new_tool", expected: "tool_added" });
  });
});

describe("fetchMcpTools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a tools/list JSON-RPC request and returns the tools array", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { tools: [{ name: "search_orders" }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tools = await fetchMcpTools("https://mcp.example.com");

    expect(tools).toEqual([{ name: "search_orders" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.example.com");
    expect(JSON.parse(init.body)).toMatchObject({ jsonrpc: "2.0", method: "tools/list" });
  });

  it("throws when the server responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchMcpTools("https://mcp.example.com")).rejects.toThrow(
      "MCP tools/list request failed: 500"
    );
  });

  it("returns an empty array when the response has no tools", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await fetchMcpTools("https://mcp.example.com")).toEqual([]);
  });
});
