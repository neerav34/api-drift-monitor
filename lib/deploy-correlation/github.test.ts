import { afterEach, describe, expect, it, vi } from "vitest";
import { findNearestCommit, formatCommitLabel } from "./github";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findNearestCommit", () => {
  it("returns the nearest preceding commit, querying the `until` timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { sha: "a1b2c3d4e5f6", commit: { message: "refactor user serializer\n\nlonger body" } },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const commit = await findNearestCommit("acme/orders-api", new Date("2026-01-01T00:00:00Z"));
    expect(commit).toEqual({ sha: "a1b2c3d4e5f6", message: "refactor user serializer" });

    const [url] = fetchMock.mock.calls[0];
    expect(url.toString()).toContain("repos/acme/orders-api/commits");
    expect(url.toString()).toContain("until=2026-01-01");
  });

  it("returns undefined when no commit precedes the timestamp", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const commit = await findNearestCommit("acme/orders-api", new Date());
    expect(commit).toBeUndefined();
  });

  it("throws on a malformed repo string", async () => {
    await expect(findNearestCommit("not-a-repo", new Date())).rejects.toThrow(
      'github_repo must be "owner/repo"'
    );
  });
});

describe("formatCommitLabel", () => {
  it("shortens the sha to 7 chars and keeps the first message line", () => {
    expect(formatCommitLabel({ sha: "a1b2c3d4e5f6", message: "refactor user serializer" })).toBe(
      "a1b2c3d: refactor user serializer"
    );
  });
});
