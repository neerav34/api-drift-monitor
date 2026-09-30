import { describe, expect, it } from "vitest";
import { buildDailyHistory } from "./daily-status";

const now = new Date("2026-09-30T12:00:00Z");

describe("buildDailyHistory", () => {
  it("returns one no-data bucket per day when there are no runs at all", () => {
    const buckets = buildDailyHistory([], 3, now);
    expect(buckets).toEqual([
      { date: "2026-09-28", status: "no-data", totalChecks: 0, driftChecks: 0 },
      { date: "2026-09-29", status: "no-data", totalChecks: 0, driftChecks: 0 },
      { date: "2026-09-30", status: "no-data", totalChecks: 0, driftChecks: 0 },
    ]);
  });

  it("orders buckets oldest first", () => {
    const buckets = buildDailyHistory([], 3, now);
    expect(buckets.map((b) => b.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("maps a clean day to good", () => {
    const buckets = buildDailyHistory(
      [{ status: "ok", checked_at: "2026-09-30T01:00:00Z" }],
      1,
      now
    );
    expect(buckets[0]).toMatchObject({ status: "good", totalChecks: 1, driftChecks: 0 });
  });

  it("picks the worst status seen that day, not the last one", () => {
    const buckets = buildDailyHistory(
      [
        { status: "drift", checked_at: "2026-09-30T01:00:00Z" },
        { status: "ok", checked_at: "2026-09-30T05:00:00Z" }, // a later retry succeeding
      ],
      1,
      now
    );
    expect(buckets[0].status).toBe("serious");
  });

  it("ranks error above drift above timeout above ok", () => {
    const day = "2026-09-30T01:00:00Z";
    expect(buildDailyHistory([{ status: "error", checked_at: day }], 1, now)[0].status).toBe(
      "critical"
    );
    expect(buildDailyHistory([{ status: "timeout", checked_at: day }], 1, now)[0].status).toBe(
      "warning"
    );
  });

  it("counts drifted checks separately from total checks", () => {
    const buckets = buildDailyHistory(
      [
        { status: "drift", checked_at: "2026-09-30T01:00:00Z" },
        { status: "drift", checked_at: "2026-09-30T02:00:00Z" },
        { status: "ok", checked_at: "2026-09-30T03:00:00Z" },
      ],
      1,
      now
    );
    expect(buckets[0]).toMatchObject({ totalChecks: 3, driftChecks: 2 });
  });

  it("ignores runs outside the requested window", () => {
    const buckets = buildDailyHistory(
      [{ status: "error", checked_at: "2026-09-01T01:00:00Z" }],
      3,
      now
    );
    expect(buckets.every((b) => b.status === "no-data")).toBe(true);
  });
});
