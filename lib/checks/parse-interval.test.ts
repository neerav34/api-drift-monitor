import { describe, expect, it } from "vitest";
import { parseIntervalMs } from "./parse-interval";

describe("parseIntervalMs", () => {
  it("parses hours, minutes, and days", () => {
    expect(parseIntervalMs("1 hour")).toBe(3_600_000);
    expect(parseIntervalMs("30 minutes")).toBe(1_800_000);
    expect(parseIntervalMs("2 days")).toBe(172_800_000);
  });

  it("is case-insensitive and tolerates missing/extra whitespace", () => {
    expect(parseIntervalMs("1HOUR")).toBe(3_600_000);
    expect(parseIntervalMs("  2  Hours  ")).toBe(7_200_000);
  });

  it("falls back to 1 hour for an unparseable value", () => {
    expect(parseIntervalMs("whenever")).toBe(3_600_000);
  });
});
