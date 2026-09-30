import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriftAlert } from "./types";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const alert: DriftAlert = {
  apiName: "Orders API",
  apiId: "api-1",
  endpointPath: "/users/{id}",
  endpointMethod: "GET",
  driftDetails: [{ type: "missing", field: "email" }],
  dashboardUrl: "https://example.com/dashboard/api-1",
};

beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
});

afterEach(() => {
  sendMock.mockReset();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

describe("sendEmailAlert", () => {
  it("sends an HTML email containing the drift details and dashboard link", async () => {
    sendMock.mockResolvedValue({ error: null });
    const { sendEmailAlert } = await import("./email");

    await sendEmailAlert("dev@example.com", alert);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("dev@example.com");
    expect(call.subject).toContain("Orders API");
    expect(call.html).toContain("email");
    expect(call.html).toContain(alert.dashboardUrl);
    expect(call.from).toContain("onboarding@resend.dev");
  });

  it("uses RESEND_FROM_EMAIL when set", async () => {
    process.env.RESEND_FROM_EMAIL = "alerts@mycompany.com";
    sendMock.mockResolvedValue({ error: null });
    const { sendEmailAlert } = await import("./email");

    await sendEmailAlert("dev@example.com", alert);

    expect(sendMock.mock.calls[0][0].from).toBe("alerts@mycompany.com");
  });

  it("throws when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmailAlert } = await import("./email");
    await expect(sendEmailAlert("dev@example.com", alert)).rejects.toThrow(
      "RESEND_API_KEY is not set"
    );
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ error: { message: "invalid recipient" } });
    const { sendEmailAlert } = await import("./email");
    await expect(sendEmailAlert("dev@example.com", alert)).rejects.toThrow(
      "Email alert failed: invalid recipient"
    );
  });
});
