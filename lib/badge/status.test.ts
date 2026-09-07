import { describe, expect, it } from "vitest";
import { computeBadgeState } from "./status";

const now = new Date("2026-01-10T00:00:00Z");

describe("computeBadgeState", () => {
  it("reports no data when the API has no endpoints yet", () => {
    expect(computeBadgeState({ endpointStatuses: [], lastBadRunAt: null, firstRunAt: null }, now)).toEqual({
      color: "gray",
      message: "no data",
    });
  });

  it("reports drifting red when any endpoint isn't ok", () => {
    const result = computeBadgeState(
      { endpointStatuses: ["ok", "drift"], lastBadRunAt: "2026-01-09T00:00:00Z", firstRunAt: null },
      now
    );
    expect(result).toEqual({ color: "red", message: "drifting" });
  });

  it("reports stable Nd counting from the last bad run when every endpoint is ok", () => {
    const result = computeBadgeState(
      { endpointStatuses: ["ok", "ok"], lastBadRunAt: "2026-01-05T00:00:00Z", firstRunAt: "2025-12-01T00:00:00Z" },
      now
    );
    expect(result).toEqual({ color: "green", message: "stable 5d" });
  });

  it("falls back to the first run ever when there's never been a bad run", () => {
    const result = computeBadgeState(
      { endpointStatuses: ["ok"], lastBadRunAt: null, firstRunAt: "2026-01-03T00:00:00Z" },
      now
    );
    expect(result).toEqual({ color: "green", message: "stable 7d" });
  });

  it("reports plain stable when there's no run history at all but current status is ok", () => {
    const result = computeBadgeState(
      { endpointStatuses: ["ok"], lastBadRunAt: null, firstRunAt: null },
      now
    );
    expect(result).toEqual({ color: "green", message: "stable" });
  });
});
