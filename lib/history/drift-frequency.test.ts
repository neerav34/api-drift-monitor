import { describe, expect, it } from "vitest";
import { buildDriftFrequencyRows, type EndpointForFrequency } from "./drift-frequency";

const endpoints: EndpointForFrequency[] = [
  { id: "e1", path: "/orders", method: "GET", apiId: "a1", apiName: "Orders API" },
  { id: "e2", path: "/users/{id}", method: "GET", apiId: "a1", apiName: "Orders API" },
  { id: "e3", path: "/healthz", method: "GET", apiId: "a2", apiName: "QRDrop" },
];

describe("buildDriftFrequencyRows", () => {
  it("ranks endpoints by drift count descending", () => {
    const rows = buildDriftFrequencyRows(endpoints, [
      { endpoint_id: "e1", status: "ok", checked_at: "2026-09-01T00:00:00Z" },
      { endpoint_id: "e2", status: "drift", checked_at: "2026-09-01T00:00:00Z" },
      { endpoint_id: "e2", status: "drift", checked_at: "2026-09-02T00:00:00Z" },
      { endpoint_id: "e2", status: "ok", checked_at: "2026-09-03T00:00:00Z" },
      { endpoint_id: "e3", status: "drift", checked_at: "2026-09-01T00:00:00Z" },
    ]);

    expect(rows.map((r) => r.endpointId)).toEqual(["e2", "e3", "e1"]);
  });

  it("computes drift rate and the most recent drift timestamp", () => {
    const rows = buildDriftFrequencyRows(endpoints, [
      { endpoint_id: "e2", status: "drift", checked_at: "2026-09-01T00:00:00Z" },
      { endpoint_id: "e2", status: "drift", checked_at: "2026-09-05T00:00:00Z" },
      { endpoint_id: "e2", status: "ok", checked_at: "2026-09-03T00:00:00Z" },
      { endpoint_id: "e2", status: "ok", checked_at: "2026-09-04T00:00:00Z" },
    ]);

    expect(rows[0]).toMatchObject({
      totalChecks: 4,
      driftChecks: 2,
      driftRate: 0.5,
      lastDriftAt: "2026-09-05T00:00:00Z",
    });
  });

  it("drops endpoints with zero checks in the window", () => {
    const rows = buildDriftFrequencyRows(endpoints, [
      { endpoint_id: "e1", status: "ok", checked_at: "2026-09-01T00:00:00Z" },
    ]);
    expect(rows.map((r) => r.endpointId)).toEqual(["e1"]);
  });

  it("returns an empty list when nothing has been checked yet", () => {
    expect(buildDriftFrequencyRows(endpoints, [])).toEqual([]);
  });

  it("reports null lastDriftAt for an endpoint that's never drifted", () => {
    const rows = buildDriftFrequencyRows(endpoints, [
      { endpoint_id: "e1", status: "ok", checked_at: "2026-09-01T00:00:00Z" },
    ]);
    expect(rows[0].lastDriftAt).toBeNull();
  });
});
