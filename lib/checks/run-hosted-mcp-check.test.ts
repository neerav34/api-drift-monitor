import { afterEach, describe, expect, it, vi } from "vitest";
import { runHostedMcpCheck } from "./run-hosted-mcp-check";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockToolsListResponse(tools: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { tools } }) })
  );
}

describe("runHostedMcpCheck", () => {
  it("reports ok for every tool on a first check (no previous snapshot)", async () => {
    mockToolsListResponse([{ name: "search_orders" }, { name: "delete_order" }]);

    const { results, newSnapshot } = await runHostedMcpCheck({
      base_url: "https://mcp.example.com",
      mcp_snapshot: null,
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(results.map((r) => r.path).sort()).toEqual(["tool:delete_order", "tool:search_orders"]);
    expect(newSnapshot).toEqual([{ name: "search_orders" }, { name: "delete_order" }]);
  });

  it("flags drift for a tool whose schema changed since the persisted snapshot", async () => {
    mockToolsListResponse([
      { name: "search_orders", inputSchema: { properties: { status: { type: "string" } } } },
    ]);

    const { results } = await runHostedMcpCheck({
      base_url: "https://mcp.example.com",
      mcp_snapshot: [
        {
          name: "search_orders",
          inputSchema: { properties: { status: { enum: ["open", "closed"] } } },
        },
      ],
    });

    expect(results).toEqual([
      {
        path: "tool:search_orders",
        method: "MCP",
        status: "drift",
        drift: [{ type: "wrongType", field: "status", expected: "enum", got: "string" }],
      },
    ]);
  });

  it("flags a removed tool as drift and still returns the shrunk snapshot", async () => {
    mockToolsListResponse([]);

    const { results, newSnapshot } = await runHostedMcpCheck({
      base_url: "https://mcp.example.com",
      mcp_snapshot: [{ name: "delete_order" }],
    });

    expect(results).toEqual([
      { path: "tool:delete_order", method: "MCP", status: "drift", drift: [{ type: "missing", field: "delete_order" }] },
    ]);
    expect(newSnapshot).toEqual([]);
  });

  it("reports no drift when nothing changed", async () => {
    const snapshot = [{ name: "search_orders", inputSchema: { properties: { status: { type: "string" } } } }];
    mockToolsListResponse(snapshot);

    const { results } = await runHostedMcpCheck({
      base_url: "https://mcp.example.com",
      mcp_snapshot: snapshot,
    });

    expect(results).toEqual([{ path: "tool:search_orders", method: "MCP", status: "ok", drift: [] }]);
  });
});
