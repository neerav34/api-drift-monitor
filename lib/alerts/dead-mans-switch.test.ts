import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDeadMansSwitchAlert } from "./dead-mans-switch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendDeadMansSwitchAlert", () => {
  it("posts a Slack-shaped text payload by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendDeadMansSwitchAlert("https://hooks.slack.test/xyz", "Orders API", "https://d.example.com");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text).toContain("Orders API");
  });

  it("posts a Discord-shaped content payload for a discord.com webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendDeadMansSwitchAlert(
      "https://discord.com/api/webhooks/xyz",
      "Orders API",
      "https://d.example.com"
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.content).toContain("Orders API");
  });

  it("throws when the webhook responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(
      sendDeadMansSwitchAlert("https://hooks.slack.test/bad", "Orders API", "https://d.example.com")
    ).rejects.toThrow("Dead man's switch alert failed: 500");
  });
});
