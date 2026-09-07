import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSlackAlert } from "./slack";
import type { DriftAlert } from "./types";

const alert: DriftAlert = {
  apiName: "Orders API",
  apiId: "api-1",
  endpointPath: "/users/{id}",
  endpointMethod: "GET",
  driftDetails: [{ type: "missing", field: "email" }],
  dashboardUrl: "https://example.com/dashboard/api-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendSlackAlert", () => {
  it("posts a Block Kit payload with the drift line and dashboard button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackAlert("https://hooks.slack.test/xyz", alert);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.test/xyz");
    const body = JSON.parse(init.body);
    expect(body.text).toContain("Orders API");
    const flat = JSON.stringify(body.blocks);
    expect(flat).toContain("email");
    expect(flat).toContain(alert.dashboardUrl);
  });

  it("throws when the webhook responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(sendSlackAlert("https://hooks.slack.test/bad", alert)).rejects.toThrow(
      "Slack alert failed: 404"
    );
  });
});
