import { afterEach, describe, expect, it, vi } from "vitest";
import { runHostedCheck, type HostedCheckApi, type EndpointToCheck } from "./run-hosted-check";

const api: HostedCheckApi = {
  base_url: "https://api.example.com",
  spec_url: null,
  spec_mode: "baseline",
  auth_header_enc: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runHostedCheck", () => {
  it("refuses to check a mutating endpoint", async () => {
    const endpoint: EndpointToCheck = {
      path: "/users/{id}",
      method: "DELETE",
      is_mutating: true,
      baseline_schema: null,
    };
    await expect(runHostedCheck(api, endpoint)).rejects.toThrow("must not be called");
  });

  it("hits the resolved URL with path params filled and reports ok with no schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 200, json: async () => ({ id: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    const endpoint: EndpointToCheck = {
      path: "/users/{id}",
      method: "GET",
      is_mutating: false,
      baseline_schema: null,
    };
    const result = await runHostedCheck(api, endpoint);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/users/1",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toMatchObject({ status: "ok", responseStatusCode: 200 });
  });

  it("diffs against the endpoint's baseline schema and reports drift", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, json: async () => ({ id: 1 }) })
    );

    const endpoint: EndpointToCheck = {
      path: "/users/{id}",
      method: "GET",
      is_mutating: false,
      baseline_schema: { type: "object", required: ["id", "email"] },
    };
    const result = await runHostedCheck(api, endpoint);

    expect(result.status).toBe("drift");
    expect(result.drift).toContainEqual({ type: "missing", field: "email" });
  });

  it("reports timeout when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const endpoint: EndpointToCheck = {
      path: "/users/{id}",
      method: "GET",
      is_mutating: false,
      baseline_schema: null,
    };
    const result = await runHostedCheck(api, endpoint);
    expect(result.status).toBe("timeout");
  });
});
