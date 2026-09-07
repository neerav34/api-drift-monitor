import { afterEach, describe, expect, it, vi } from "vitest";

const dereferenceMock = vi.fn();
vi.mock("@apidevtools/swagger-parser", () => ({
  dereference: (...args: unknown[]) => dereferenceMock(...args),
}));

const spec = {
  paths: {
    "/users/{id}": {
      get: {
        operationId: "getUser",
        responses: {
          "200": { content: { "application/json": { schema: { type: "object" } } } },
        },
      },
      delete: { operationId: "deleteUser" },
    },
  },
};

afterEach(() => {
  dereferenceMock.mockReset();
});

describe("extractEndpointsFromSpec", () => {
  it("walks every path/method and flags mutating ones", async () => {
    dereferenceMock.mockResolvedValue(spec);
    const { extractEndpointsFromSpec } = await import("./openapi");

    const endpoints = await extractEndpointsFromSpec("https://example.com/openapi.json");

    expect(endpoints).toContainEqual({
      path: "/users/{id}",
      method: "GET",
      operationId: "getUser",
      isMutating: false,
    });
    expect(endpoints).toContainEqual({
      path: "/users/{id}",
      method: "DELETE",
      operationId: "deleteUser",
      isMutating: true,
    });
  });
});

describe("getResponseSchema", () => {
  it("returns the 200 response's JSON schema for the given path/method", async () => {
    dereferenceMock.mockResolvedValue(spec);
    const { getResponseSchema } = await import("./openapi");

    const schema = await getResponseSchema("https://example.com/openapi.json", "/users/{id}", "GET");
    expect(schema).toEqual({ type: "object" });
  });

  it("returns undefined for an operation with no matching response", async () => {
    dereferenceMock.mockResolvedValue(spec);
    const { getResponseSchema } = await import("./openapi");

    const schema = await getResponseSchema("https://example.com/openapi.json", "/users/{id}", "DELETE");
    expect(schema).toBeUndefined();
  });
});
