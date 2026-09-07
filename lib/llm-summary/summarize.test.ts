import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeDrift } from "./summarize";

const input = {
  apiName: "Orders API",
  endpointMethod: "GET",
  endpointPath: "/users/{id}",
  driftDetails: [{ type: "missing" as const, field: "email" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe("summarizeDrift", () => {
  it("returns undefined when no provider key is configured, without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await summarizeDrift(input);
    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Groq and returns the trimmed completion", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "  Field email dropped, likely a refactor.  " } }],
        }),
      })
    );

    const result = await summarizeDrift(input);
    expect(result).toBe("Field email dropped, likely a refactor.");
  });

  it("returns undefined instead of throwing when the provider call fails", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const result = await summarizeDrift(input);
    expect(result).toBeUndefined();
  });
});
